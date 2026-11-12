"use server";

import { randomInt } from "node:crypto";
import {
  addTicketNote,
  applySettingsChange,
  checkTicketOptions,
  checkTicketPanels,
  entitlements,
  getGuildPlan,
  getTicketByNumber,
  getTicketConfig,
  getTicketPanelPost,
  newId,
  parseEmoji,
  TICKET_LIMITS,
  TICKET_PANEL_PRESETS,
  type TicketPanel,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getServerLayout, listGuildEmojis, listGuildRoles, listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Ticket setup and staff notes. Each action re-checks access for the server in the
 * form, re-reads the plan, and validates with the same checkers the bot uses. Roles
 * and channels must belong to this server.
 */

const back = (guildId: string, outcome: { ok: string } | { error: string }, open = "") =>
  flashBack(`/servers/${guildId}/parley`, outcome, `${open ? `?edit=${open}#${open}` : ""}`);

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [config, plan] = await Promise.all([
    getTicketConfig(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, ent: entitlements(plan), config };
}

type Ctx = Awaited<ReturnType<typeof load>>;

async function apply(ctx: Ctx, patch: Record<string, unknown>, ok: string, open = "") {
  const result = await applySettingsChange(await getDb(), {
    guildId: ctx.guild.id,
    module: "tickets",
    patch,
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(
      ctx.guild.id,
      { error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute." },
      open,
    );
  return back(ctx.guild.id, { ok }, open);
}

async function savePanels(ctx: Ctx, next: unknown[], ok: string, open = "") {
  const checked = checkTicketPanels(next, ctx.ent, ctx.config.panels);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, open);
  return apply(ctx, { panels: checked.value }, ok, open);
}

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

export async function addPanel(form: FormData) {
  const ctx = await load(form);
  const preset = TICKET_PANEL_PRESETS[String(form.get("preset") ?? "")];
  if (!preset) return back(ctx.guild.id, { error: "Pick a starting point." });
  const name = String(form.get("name") ?? "").trim() || preset.name;
  const panel: TicketPanel = {
    id: newId(crypto01),
    name,
    card: preset.card,
    topics: preset.topics.map((label) => ({
      id: newId(crypto01),
      label,
      emoji: null,
      questions: [],
    })),
  };
  return savePanels(
    ctx,
    [...ctx.config.panels, panel],
    `Added ${name}. Check its topics, then post it.`,
    panel.id,
  );
}

export async function savePanel(form: FormData) {
  const ctx = await load(form);
  let panel: TicketPanel;
  try {
    panel = JSON.parse(String(form.get("panel") ?? "")) as TicketPanel;
  } catch {
    return back(ctx.guild.id, { error: "That form wasn't valid. Refresh and try again." });
  }
  const id = typeof panel?.id === "string" ? panel.id : "";
  if (!ctx.config.panels.some((p) => p.id === id))
    return back(ctx.guild.id, { error: "That panel was removed. Refresh and try again." });
  const emojiIds = new Set((await listGuildEmojis(ctx.guild.id).catch(() => [])).map((e) => e.id));
  for (const t of Array.isArray(panel.topics) ? panel.topics : []) {
    const e = typeof t?.emoji === "string" ? parseEmoji(t.emoji) : null;
    if (e?.kind === "custom" && !emojiIds.has(e.id))
      return back(ctx.guild.id, { error: "Use emoji from this server." }, id);
  }
  const next = ctx.config.panels.map((p) => (p.id === id ? panel : p));
  const name = typeof panel.name === "string" ? panel.name.trim() : "the panel";
  const posted = await getTicketPanelPost(await getDb(), ctx.guild.id, id);
  return savePanels(
    ctx,
    next,
    posted ? `Saved ${name}. Update it in Discord below.` : `Saved ${name}.`,
    id,
  );
}

export async function removePanel(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("panelId") ?? "");
  const gone = ctx.config.panels.find((p) => p.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That panel was already removed." });
  return savePanels(
    ctx,
    ctx.config.panels.filter((p) => p.id !== id),
    `Removed ${gone.name}. Its buttons in Discord stop working; undo it from Settings history.`,
  );
}

/** Who handles tickets, where they open, and where closed ones are logged. */
export async function saveTicketOptions(form: FormData) {
  const ctx = await load(form);
  const [roles, channels, layout] = await Promise.all([
    listGuildRoles(ctx.guild.id).catch(() => null),
    listTextChannels(ctx.guild.id).catch(() => null),
    getServerLayout(ctx.guild.id).catch(() => null),
  ]);
  if (!roles || !channels || !layout)
    return back(ctx.guild.id, { error: "Discord didn't answer. Try again." }, "setup");
  const raw = {
    staffRoleIds: form.getAll("staffRoleIds").map(String),
    parentId: String(form.get("parentId") ?? "") || null,
    logChannelId: String(form.get("logChannelId") ?? "") || null,
    maxOpen: Number(form.get("maxOpen")),
    pingStaff: form.get("pingStaff") === "on",
    autoAssign: form.get("autoAssign") === "on",
    modmail: form.get("modmail") === "on",
  };
  const roleIds = new Set(roles.filter((r) => !r.managed).map((r) => r.id));
  if (!raw.staffRoleIds.every((id) => roleIds.has(id)))
    return back(ctx.guild.id, { error: "Pick staff roles from this server's list." }, "setup");
  if (raw.parentId && !layout.categories.some((c) => c.id === raw.parentId))
    return back(ctx.guild.id, { error: "Pick a category from this server's list." }, "setup");
  if (raw.logChannelId && !channels.some((c) => c.id === raw.logChannelId))
    return back(ctx.guild.id, { error: "Pick a log channel from this server's list." }, "setup");
  const checked = checkTicketOptions(raw, ctx.ent, ctx.config);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, "setup");
  return apply(ctx, checked.value, "Saved who handles tickets.", "setup");
}

/** A staff note on a ticket. Only the dashboard shows it; the member never sees it. */
export async function addNote(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const number = Number(form.get("number"));
  const path = `/servers/${access.guild.id}/parley/${number}`;
  const db = await getDb();
  const ticket = Number.isInteger(number)
    ? await getTicketByNumber(db, access.guild.id, number)
    : null;
  if (!ticket)
    return flashBack(`/servers/${access.guild.id}/parley`, { error: "That ticket was removed." });
  const body = String(form.get("body") ?? "").trim();
  if (!body) return flashBack(path, { error: "Write the note first." }, "#notes");
  if (body.length > TICKET_LIMITS.note)
    return flashBack(path, { error: `Notes can be ${TICKET_LIMITS.note} characters.` }, "#notes");
  await addTicketNote(db, {
    ticketId: ticket.id,
    guildId: access.guild.id,
    authorId: access.session.userId,
    authorName: access.session.username,
    body,
  });
  return flashBack(path, { ok: "Note added. Only staff on the dashboard see it." }, "#notes");
}
