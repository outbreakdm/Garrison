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
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { answer, type Outcome } from "@/lib/outcome";
import { checkPostTarget } from "@/lib/post-target";
import { checkGuildAccess } from "@/lib/session";

/**
 * Saved message edits. Each re-checks access for the server in the form, re-reads
 * the plan, checks the channel belongs to this server, and validates the whole
 * list with the same checker the bot reads it with.
 */

/** A message panel saves itself (an answer); a plain post goes back with the tile open. */
const back = (form: FormData, guildId: string, outcome: Outcome, open = "") =>
  answer(form, `/servers/${guildId}/dispatch`, outcome, open ? `?edit=${open}#${open}` : "");

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getMessages(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, form, ent: entitlements(plan), messages: readMessages(raw) };
}

type Ctx = Awaited<ReturnType<typeof load>>;

async function save(ctx: Ctx, next: unknown[], ok: string, open = ""): Promise<AutoResult> {
  const checked = checkMessages(next, ctx.ent, ctx.messages);
  if (!checked.ok) return back(ctx.form, ctx.guild.id, { error: checked.error }, open);
  const result = await applySettingsChange(await getDb(), {
    guildId: ctx.guild.id,
    module: "messages",
    patch: { messages: checked.value },
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(
      ctx.form,
      ctx.guild.id,
      result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." },
      open,
    );
  return back(ctx.form, ctx.guild.id, { ok, changeId: result.change.id }, open);
}

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

export async function addMessage(form: FormData): Promise<AutoResult> {
  const ctx = await load(form);
  const preset = MESSAGE_PRESETS[String(form.get("preset") ?? "")];
  if (!preset) return back(form, ctx.guild.id, { error: "Pick a starting point." });
  const name = String(form.get("name") ?? "").trim() || preset.name;
  const m: SavedMessage = {
    id: newId(crypto01),
    name,
    card: preset.card,
    buttons: [],
    channelId: null,
    forumPost: null,
    schedule: null,
  };
  return save(
    ctx,
    [...ctx.messages, m],
    `Added ${name}. Write it, then post it or schedule it.`,
    m.id,
  );
}

export async function saveMessage(form: FormData): Promise<AutoResult> {
  const ctx = await load(form);
  let m: SavedMessage;
  try {
    m = JSON.parse(String(form.get("message") ?? "")) as SavedMessage;
  } catch {
    return back(form, ctx.guild.id, { error: "That form wasn't valid. Refresh and try again." });
  }
  const id = typeof m?.id === "string" ? m.id : "";
  if (!ctx.messages.some((x) => x.id === id))
    return back(form, ctx.guild.id, { error: "That message was removed. Refresh and try again." });
  if (m.channelId) {
    const target = await checkPostTarget(ctx.guild.id, m.channelId);
    if (!target)
      return back(
        form,
        ctx.guild.id,
        { error: "Pick a channel, thread or forum from this server." },
        id,
      );
    // A forum post's title and tags only mean something in a forum, and only its own tags.
    if (target.kind !== "forum") m = { ...m, forumPost: null };
    else if (m.forumPost)
      m = {
        ...m,
        forumPost: {
          ...m.forumPost,
          tagIds: (m.forumPost.tagIds ?? []).filter((t) => target.tags.some((x) => x.id === t)),
        },
      };
  }
  const name = typeof m.name === "string" ? m.name.trim() : "the message";
  return save(
    ctx,
    ctx.messages.map((x) => (x.id === id ? m : x)),
    `Saved ${name}.`,
    id,
  );
}

export async function removeMessage(form: FormData): Promise<AutoResult> {
  const ctx = await load(form);
  const id = String(form.get("messageId") ?? "");
  const gone = ctx.messages.find((m) => m.id === id);
  if (!gone) return back(form, ctx.guild.id, { error: "That message was already removed." });
  return save(
    ctx,
    ctx.messages.filter((m) => m.id !== id),
    `Removed ${gone.name}. Anything already posted stays; undo it from Settings history.`,
  );
}
