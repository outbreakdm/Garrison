"use server";

import { randomInt } from "node:crypto";
import {
  applySettingsChange,
  checkMessages,
  entitlements,
  getGuildPlan,
  getMessages,
  MESSAGE_PRESETS,
  newId,
  readMessages,
  type SavedMessage,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Saved message edits. Each re-checks access for the server in the form, re-reads
 * the plan, checks the channel belongs to this server, and validates the whole
 * list with the same checker the bot reads it with.
 */

const back = (guildId: string, outcome: { ok: string } | { error: string }, open = "") =>
  flashBack(`/servers/${guildId}/dispatch`, outcome, `${open ? `?edit=${open}#${open}` : ""}`);

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getMessages(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, ent: entitlements(plan), messages: readMessages(raw) };
}

type Ctx = Awaited<ReturnType<typeof load>>;

async function save(ctx: Ctx, next: unknown[], ok: string, open = "") {
  const checked = checkMessages(next, ctx.ent, ctx.messages);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, open);
  const result = await applySettingsChange(await getDb(), {
    guildId: ctx.guild.id,
    module: "messages",
    patch: { messages: checked.value },
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

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

export async function addMessage(form: FormData) {
  const ctx = await load(form);
  const preset = MESSAGE_PRESETS[String(form.get("preset") ?? "")];
  if (!preset) return back(ctx.guild.id, { error: "Pick a starting point." });
  const name = String(form.get("name") ?? "").trim() || preset.name;
  const m: SavedMessage = {
    id: newId(crypto01),
    name,
    card: preset.card,
    buttons: [],
    channelId: null,
    schedule: null,
  };
  return save(
    ctx,
    [...ctx.messages, m],
    `Added ${name}. Write it, then post it or schedule it.`,
    m.id,
  );
}

export async function saveMessage(form: FormData) {
  const ctx = await load(form);
  let m: SavedMessage;
  try {
    m = JSON.parse(String(form.get("message") ?? "")) as SavedMessage;
  } catch {
    return back(ctx.guild.id, { error: "That form wasn't valid. Refresh and try again." });
  }
  const id = typeof m?.id === "string" ? m.id : "";
  if (!ctx.messages.some((x) => x.id === id))
    return back(ctx.guild.id, { error: "That message was removed. Refresh and try again." });
  if (m.channelId) {
    const channels = await listTextChannels(ctx.guild.id).catch(() => []);
    if (!channels.some((c) => c.id === m.channelId))
      return back(ctx.guild.id, { error: "Pick a text channel from this server." }, id);
  }
  const name = typeof m.name === "string" ? m.name.trim() : "the message";
  return save(
    ctx,
    ctx.messages.map((x) => (x.id === id ? m : x)),
    `Saved ${name}.`,
    id,
  );
}

export async function removeMessage(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("messageId") ?? "");
  const gone = ctx.messages.find((m) => m.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That message was already removed." });
  return save(
    ctx,
    ctx.messages.filter((m) => m.id !== id),
    `Removed ${gone.name}. Anything already posted stays; undo it from Settings history.`,
  );
}
