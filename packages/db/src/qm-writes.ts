import { CARD_LIMITS, type CardBlock, type CustomCard, parseCard } from "./cards";
import type { Db } from "./client";
import { checkMessages, MESSAGE_LIMITS, readMessages, type SavedMessage } from "./messages";
import type { Entitlements } from "./plans";
import { readSettings } from "./repo/settings";
import { readWelcome } from "./welcome";

/**
 * Text the AI assistant writes into a plan (docs/AI_ASSISTANT.md, phase 7): the welcome,
 * leave and DM cards, new saved messages and rewrites of existing ones. Each write is checked
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
  kind: "welcome" | "message";
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
}

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
    // A new saved message: given an id now, so a post in the same plan can name it.
    const name = String(p.name ?? p.title)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MESSAGE_LIMITS.name);
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
    const ref =
      String(p.messageId ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 32) || undefined;
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
  return { ok: true, writes };
}

/**
 * The settings patches that apply a plan's writes to the server as it is now: the welcome
 * cards it writes, and the saved-message list with its new and rewritten messages. Checked
 * again here, since the server may have changed since the plan was drafted.
 */
export async function qmWritePatches(
  db: Db,
  guildId: string,
  writes: QmWrite[],
  ent: Entitlements,
): Promise<
  | { ok: true; patches: { module: "welcome" | "messages"; patch: Record<string, unknown> }[] }
  | { ok: false; error: string }
> {
  const patches: { module: "welcome" | "messages"; patch: Record<string, unknown> }[] = [];
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
  return { ok: true, patches };
}
