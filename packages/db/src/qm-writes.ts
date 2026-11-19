import { CARD_LIMITS, type CardBlock, type CustomCard, parseCard } from "./cards";
import type { Db } from "./client";
import { checkMessages, MESSAGE_LIMITS, readMessages, type SavedMessage } from "./messages";
import type { Entitlements } from "./plans";
import type { QmSettingsLookup } from "./qm-settings";
import { readSettings } from "./repo/settings";
import {
  checkRoleMenus,
  isOneEmoji,
  ROLE_MENU_LIMITS,
  type RoleMenu,
  readRoleMenus,
} from "./role-menus";
import { checkTicketPanels, readTicketPanels, TICKET_LIMITS, type TicketPanel } from "./tickets";
import { readWelcome } from "./welcome";

/**
 * Text the AI assistant writes into a plan (docs/AI_ASSISTANT.md, phases 7 and 8B): the
 * welcome, leave and DM cards, new saved messages and rewrites of existing ones, and new role
 * menus and ticket panels (a card with roles, or with topics). Each write is checked
 * by the dashboard's own rules (parseCard, checkMessages), shown in full before it's applied,
 * applied through Settings history (so Undo puts the old text back), and costs one change.
 * The model writes a title and a body; the rest of a card's look stays as it is.
 */

export const QM_WRITES_MAX = 3;

export const QM_WRITE_TARGETS = [
  "welcome_join",
  "welcome_leave",
  "welcome_dm",
  "new_message",
  "edit_message",
  "new_role_menu",
  "new_ticket_panel",
] as const;
export type QmWriteTarget = (typeof QM_WRITE_TARGETS)[number];

const WELCOME_FIELD = {
  welcome_join: "joinCard",
  welcome_leave: "leaveCard",
  welcome_dm: "dmCard",
} as const;
const WELCOME_NAME = {
  joinCard: "The welcome card",
  leaveCard: "The leave card",
  dmCard: "The welcome DM",
} as const;

/** One write, checked, as a plan stores it. */
export interface QmWrite {
  kind: "welcome" | "message" | "role_menu" | "ticket_panel";
  /** Welcome: which card. */
  field?: "joinCard" | "leaveCard" | "dmCard";
  /** Message: the saved message's id; for a new one, made when the plan is drafted. */
  messageId?: string;
  /** Message: the plan makes it. */
  isNew?: boolean;
  /** Message: the ref posts in the same plan use for a new one. */
  ref?: string;
  /** What the preview calls it: "The welcome card", a message's name. */
  name: string;
  card: CustomCard;
  /** What it said before; null for a new message. */
  was: CustomCard | null;
  /** A new role menu, its roles as ids or refs of roles the same plan makes. */
  menu?: RoleMenu;
  /** A new ticket panel. */
  panel?: TicketPanel;
  /** Ticket panels: staff roles to add to the server's ticket staff, ids or refs. */
  staffRoleIds?: string[];
}

/** A write as the model proposes it. */
export interface QmWriteProposal {
  target: string;
  /** edit_message: the saved message's id. new_message: a short ref posts can use. */
  messageId?: string;
  /** new_message: its name on the Messages page. */
  name?: string;
  title: string;
  body: string;
  /** new_role_menu: "buttons" or "dropdown". */
  style?: string;
  /** new_role_menu: a role each (id or ref) with its label and emoji. new_ticket_panel: topics. */
  items?: { role: string; label: string; emoji: string }[];
  /** new_ticket_panel: roles that see and answer its tickets, ids or refs. */
  staffRoles?: string[];
}

const BLANK: CustomCard = {
  title: "",
  blocks: [],
  accent: null,
  image: null,
  thumbnail: null,
  footer: null,
  author: null,
  url: null,
};

/** A role as a plan names it: its ref when the plan makes it, an id otherwise. */
const isRef = (x: string) => !/^\d{17,20}$/.test(x);

/** A card's text, back as a title and a body (paragraphs between blank lines). */
export function cardText(card: CustomCard) {
  const body = card.blocks
    .map((b) => (b.kind === "text" ? b.text : b.kind === "field" ? `${b.name}: ${b.value}` : "---"))
    .join("\n\n");
  return { title: card.title, body };
}

/**
 * A title and a body as a card's text: the body's paragraphs become its text blocks (at most
 * the card's limit, merged from the end when there are more), keeping everything else.
 */
export function withText(base: CustomCard, title: string, body: string): CustomCard {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks: CardBlock[] = [];
  for (const p of paragraphs) {
    const last = blocks.at(-1);
    if (blocks.length >= CARD_LIMITS.blocks && last?.kind === "text")
      last.text = `${last.text}\n\n${p}`;
    else blocks.push({ kind: "text", text: p });
  }
  return { ...base, title: title.replace(/\s+/g, " ").trim(), blocks };
}

/** A saved message's id, as the Messages page makes them: 6 to 16 lowercase letters and digits. */
const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const n = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
  return n.toString(36).slice(0, 12).padStart(6, "0");
};

/**
 * Check what a plan proposes to write, against the server's cards and messages now and the
 * dashboard's rules. Returns the writes as they'd be applied, with what each replaces.
 */
export async function checkQmWrites(
  db: Db,
  guildId: string,
  proposals: QmWriteProposal[],
  ent: Entitlements,
  /** Roles in the server and the plan's new ones, for role menus and ticket staff. */
  lookup?: QmSettingsLookup,
): Promise<{ ok: true; writes: QmWrite[] } | { ok: false; errors: string[] }> {
  if (!proposals.length) return { ok: true, writes: [] };
  const errors: string[] = [];
  if (proposals.length > QM_WRITES_MAX)
    return { ok: false, errors: [`A plan writes at most ${QM_WRITES_MAX} things at once.`] };
  const [welcomeRow, messagesRow] = await Promise.all([
    readSettings(db, guildId, "welcome"),
    readSettings(db, guildId, "messages"),
  ]);
  const welcome = readWelcome(welcomeRow);
  const before = readMessages(messagesRow?.messages ?? []);
  const wantsMenu = proposals.some((p) => p.target === "new_role_menu");
  const wantsPanel = proposals.some((p) => p.target === "new_ticket_panel");
  const [menusRow, ticketsRow] = await Promise.all([
    wantsMenu ? readSettings(db, guildId, "roles") : null,
    wantsPanel ? readSettings(db, guildId, "tickets") : null,
  ]);
  const menusBefore = readRoleMenus(menusRow?.menus ?? []);
  const panelsBefore = readTicketPanels(ticketsRow?.panels ?? []);
  let menus: RoleMenu[] = [...menusBefore];
  let panels: TicketPanel[] = [...panelsBefore];
  // Refs stand in as fake ids while the dashboard's checks run, which only accept ids.
  const stand = new Map<string, string>();
  const standIn = (ref: string) => {
    let id = stand.get(ref);
    if (!id) {
      id = String(900000000000000000n + BigInt(stand.size + 1));
      stand.set(ref, id);
    }
    return id;
  };
  /**
   * A role a write names, or why it can't. `staff`: ticket staff see tickets and gain no
   * power, so roles with moderation powers are fine there; a role menu hands its roles to
   * anyone, so never.
   */
  const roleFor = (raw: string, where: string, staff: boolean): string | { error: string } => {
    const id = String(raw ?? "").trim();
    if (!id) return { error: `${where}: each needs a role.` };
    if (isRef(id)) {
      if (lookup?.created(id.toLowerCase()) !== "role")
        return { error: `${where}: "${id.slice(0, 30)}" isn't a role in this plan.` };
      return id.toLowerCase();
    }
    const role = lookup?.role(id);
    if (!role) return { error: `${where}: that role isn't in this server.` };
    if (role.status === "fixed") return { error: `${where}: @${role.name} can't be used here.` };
    if (role.status === "dangerous" && !staff)
      return {
        error: `${where}: @${role.name} has moderation or admin powers, so it can't go in a role menu.`,
      };
    return id;
  };
  let messages: SavedMessage[] = [...before];
  const writes: QmWrite[] = [];
  const seen = new Set<string>();

  for (const p of proposals) {
    if (!(QM_WRITE_TARGETS as readonly string[]).includes(p.target)) {
      errors.push(`"${String(p.target).slice(0, 30)}" isn't something the AI assistant can write.`);
      continue;
    }
    const target = p.target as QmWriteTarget;
    if (target in WELCOME_FIELD) {
      const field = WELCOME_FIELD[target as keyof typeof WELCOME_FIELD];
      if (seen.has(field)) {
        errors.push(`${WELCOME_NAME[field]} is written twice.`);
        continue;
      }
      seen.add(field);
      if (field === "dmCard" && !ent["welcome.dm"]) {
        errors.push("The welcome DM is part of Garrison Pro.");
        continue;
      }
      const card = parseCard(withText(welcome[field], p.title, p.body), WELCOME_NAME[field]);
      if (!card.ok) errors.push(card.error);
      else
        writes.push({
          kind: "welcome",
          field,
          name: WELCOME_NAME[field],
          card: card.value,
          was: welcome[field],
        });
      continue;
    }
    if (target === "edit_message") {
      const at = messages.findIndex((m) => m.id === p.messageId);
      const was = at >= 0 ? messages[at] : undefined;
      if (!was) {
        errors.push(`Saved message "${String(p.messageId).slice(0, 30)}" isn't on this server.`);
        continue;
      }
      if (seen.has(was.id)) {
        errors.push(`${was.name} is written twice.`);
        continue;
      }
      seen.add(was.id);
      const next = { ...was, card: withText(was.card, p.title, p.body) };
      messages = messages.map((m, i) => (i === at ? next : m));
      writes.push({
        kind: "message",
        messageId: was.id,
        name: was.name,
        card: next.card,
        was: was.card,
      });
      continue;
    }
    const ref =
      String(p.messageId ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 32) || undefined;
    const name = String(p.name ?? p.title)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, target === "new_message" ? MESSAGE_LIMITS.name : ROLE_MENU_LIMITS.name);
    if (target === "new_role_menu") {
      const where = name || "The role menu";
      const options: RoleMenu["options"] = [];
      for (const item of p.items ?? []) {
        const role = roleFor(item.role, where, false);
        if (typeof role !== "string") {
          errors.push(role.error);
          continue;
        }
        const emoji = String(item.emoji ?? "").trim();
        options.push({
          roleId: role,
          label: String(item.label ?? "")
            .trim()
            .slice(0, ROLE_MENU_LIMITS.label),
          emoji: emoji && isOneEmoji(emoji) ? emoji : null,
          description: null,
        });
      }
      if (!options.length) errors.push(`${where}: a role menu needs at least one role.`);
      const menu: RoleMenu = {
        id: newId(),
        name: name || "Role menu",
        card: withText(BLANK, p.title, p.body),
        style: p.style === "dropdown" ? "dropdown" : "buttons",
        options,
        maxPicks: null,
        requiredRoleId: null,
        placeholder: null,
      };
      // Checked with stand-in ids for the plan's new roles; stored with their refs.
      const checked = {
        ...menu,
        options: options.map((o) => ({
          ...o,
          roleId: isRef(o.roleId) ? standIn(o.roleId) : o.roleId,
        })),
      };
      menus = [...menus, checked];
      writes.push({
        kind: "role_menu",
        isNew: true,
        ...(ref ? { ref } : {}),
        name: menu.name,
        card: menu.card,
        was: null,
        menu,
      });
      continue;
    }
    if (target === "new_ticket_panel") {
      const where = name || "The ticket panel";
      const topics = (p.items ?? []).map((item) => {
        const emoji = String(item.emoji ?? "").trim();
        return {
          id: newId(),
          label: String(item.label ?? "")
            .trim()
            .slice(0, TICKET_LIMITS.label),
          emoji: emoji && isOneEmoji(emoji) ? emoji : null,
          questions: [],
        };
      });
      if (!topics.length) errors.push(`${where}: a ticket panel needs at least one topic.`);
      const staff: string[] = [];
      for (const r of p.staffRoles ?? []) {
        const role = roleFor(r, where, true);
        if (typeof role !== "string") errors.push(role.error);
        else if (!staff.includes(role)) staff.push(role);
      }
      if (staff.length > TICKET_LIMITS.staffRoles)
        errors.push(`${where}: at most ${TICKET_LIMITS.staffRoles} staff roles.`);
      const panel: TicketPanel = {
        id: newId(),
        name: name || "Ticket panel",
        card: withText(BLANK, p.title, p.body),
        topics,
      };
      panels = [...panels, panel];
      writes.push({
        kind: "ticket_panel",
        isNew: true,
        ...(ref ? { ref } : {}),
        name: panel.name,
        card: panel.card,
        was: null,
        panel,
        staffRoleIds: staff,
      });
      continue;
    }
    // A new saved message: given an id now, so a post in the same plan can name it.
    if (!name) {
      errors.push("A new message needs a name.");
      continue;
    }
    const msg: SavedMessage = {
      id: newId(),
      name,
      card: withText(
        {
          title: "",
          blocks: [],
          accent: null,
          image: null,
          thumbnail: null,
          footer: null,
          author: null,
          url: null,
        },
        p.title,
        p.body,
      ),
      buttons: [],
      channelId: null,
      schedule: null,
    };
    messages = [...messages, msg];
    writes.push({
      kind: "message",
      messageId: msg.id,
      isNew: true,
      ...(ref ? { ref } : {}),
      name,
      card: msg.card,
      was: null,
    });
  }
  if (errors.length) return { ok: false, errors };
  // The whole list as the Messages page would save it: names, cards, plan limits.
  if (writes.some((w) => w.kind === "message")) {
    const checked = checkMessages(messages, ent, before);
    if (!checked.ok) return { ok: false, errors: [checked.error] };
  }
  // Role menus and panels as their pages would save them: labels, emoji, counts, plan limits.
  if (wantsMenu) {
    const checked = checkRoleMenus(menus, ent, menusBefore);
    if (!checked.ok) return { ok: false, errors: [checked.error] };
  }
  if (wantsPanel) {
    const checked = checkTicketPanels(panels, ent, panelsBefore);
    if (!checked.ok) return { ok: false, errors: [checked.error] };
  }
  return { ok: true, writes };
}

/** The id a write's item has, for posting it: a message's, a menu's or a panel's. */
export const qmWriteItemId = (w: QmWrite) => w.messageId ?? w.menu?.id ?? w.panel?.id;

/**
 * The settings patches that apply a plan's writes to the server as it is now: the welcome
 * cards it writes, and the saved-message list with its new and rewritten messages. Checked
 * again here, since the server may have changed since the plan was drafted.
 */
type WriteModule = "welcome" | "messages" | "roles" | "tickets";

export async function qmWritePatches(
  db: Db,
  guildId: string,
  writes: QmWrite[],
  ent: Entitlements,
  /** Refs of the plan's new roles, as the ids the build made. */
  ids: Map<string, string> = new Map(),
): Promise<
  | { ok: true; patches: { module: WriteModule; patch: Record<string, unknown> }[] }
  | { ok: false; error: string }
> {
  const patches: { module: WriteModule; patch: Record<string, unknown> }[] = [];
  // A ref the build made is swapped for its id; one it didn't make stays unresolved (null).
  const real = (x: string) => (isRef(x) ? (ids.get(x) ?? null) : x);
  const welcome = Object.fromEntries(
    writes.filter((w) => w.kind === "welcome" && w.field).map((w) => [w.field as string, w.card]),
  );
  if (Object.keys(welcome).length) patches.push({ module: "welcome", patch: welcome });
  const msgs = writes.filter((w) => w.kind === "message");
  if (msgs.length) {
    const before = readMessages((await readSettings(db, guildId, "messages"))?.messages ?? []);
    let list = [...before];
    for (const w of msgs) {
      if (w.isNew) {
        if (!list.some((m) => m.id === w.messageId))
          list.push({
            id: w.messageId as string,
            name: w.name,
            card: w.card,
            buttons: [],
            channelId: null,
            schedule: null,
          });
        continue;
      }
      const at = list.findIndex((m) => m.id === w.messageId);
      if (at < 0)
        return { ok: false, error: `${w.name} was deleted from Messages since this was drafted.` };
      list = list.map((m, i) => (i === at ? { ...m, card: w.card } : m));
    }
    const checked = checkMessages(list, ent, before);
    if (!checked.ok) return { ok: false, error: checked.error };
    patches.push({ module: "messages", patch: { messages: checked.value } });
  }
  const newMenus = writes.flatMap((w) => (w.kind === "role_menu" && w.menu ? [w.menu] : []));
  if (newMenus.length) {
    const before = readRoleMenus((await readSettings(db, guildId, "roles"))?.menus ?? []);
    const add = newMenus
      .filter((m) => !before.some((b) => b.id === m.id))
      .map((m) => ({ ...m, options: m.options.map((o) => ({ ...o, roleId: real(o.roleId) })) }));
    if (add.some((m) => m.options.some((o) => o.roleId === null)))
      return { ok: false, error: "A role a menu gives wasn't made." };
    const checked = checkRoleMenus([...before, ...add], ent, before);
    if (!checked.ok) return { ok: false, error: checked.error };
    patches.push({ module: "roles", patch: { menus: checked.value } });
  }
  const newPanels = writes.filter((w) => w.kind === "ticket_panel" && w.panel);
  if (newPanels.length) {
    const row = await readSettings(db, guildId, "tickets");
    const before = readTicketPanels(row?.panels ?? []);
    const add = newPanels
      .map((w) => w.panel as TicketPanel)
      .filter((p) => !before.some((b) => b.id === p.id));
    const checked = checkTicketPanels([...before, ...add], ent, before);
    if (!checked.ok) return { ok: false, error: checked.error };
    const staffBefore = Array.isArray(row?.staffRoleIds) ? (row.staffRoleIds as string[]) : [];
    const staff = [
      ...new Set([...staffBefore, ...newPanels.flatMap((w) => (w.staffRoleIds ?? []).map(real))]),
    ];
    if (staff.some((x) => x === null))
      return { ok: false, error: "A ticket staff role wasn't made." };
    if (staff.length > TICKET_LIMITS.staffRoles)
      return {
        ok: false,
        error: `Tickets can have ${TICKET_LIMITS.staffRoles} staff roles at most.`,
      };
    patches.push({ module: "tickets", patch: { panels: checked.value, staffRoleIds: staff } });
  }
  return { ok: true, patches };
}
