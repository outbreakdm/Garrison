"use server";

import { randomInt } from "node:crypto";
import {
  applySettingsChange,
  checkResponders,
  entitlements,
  getGuildPlan,
  getResponders,
  newId,
  type Responder,
  readResponders,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Auto-responders and /tag commands on the Messages page (packages/db responders.ts). Each
 * edit re-checks access, re-reads the plan, keeps channels to this server's text channels,
 * checks the whole list like the bot reads it, and saves through Settings history.
 */

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getResponders(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, db, ent: entitlements(plan), list: readResponders(raw) };
}

const back = (guildId: string, outcome: { ok: string } | { error: string }) =>
  flashBack(`/servers/${guildId}/dispatch`, outcome, "#responders");

async function save(ctx: Awaited<ReturnType<typeof load>>, next: unknown[], ok: string) {
  const checked = checkResponders(next, ctx.ent, ctx.list);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error });
  const result = await applySettingsChange(ctx.db, {
    guildId: ctx.guild.id,
    module: "messages",
    patch: { responders: checked.value },
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(ctx.guild.id, {
      error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute.",
    });
  return back(ctx.guild.id, { ok });
}

/** Add a responder, or save changes to one (`id`). */
export async function saveResponder(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  const was = ctx.list.find((r) => r.id === id);
  const channelIds = form.getAll("channelIds").map(String).filter(Boolean);
  if (channelIds.length) {
    const ours = new Set((await listTextChannels(ctx.guild.id).catch(() => [])).map((c) => c.id));
    if (!channelIds.every((c) => ours.has(c)))
      return back(ctx.guild.id, { error: "Pick channels from this server's list." });
  }
  const next: Responder = {
    id: was?.id ?? newId(crypto01),
    name: String(form.get("name") ?? ""),
    trigger: String(form.get("trigger") ?? "") as Responder["trigger"],
    text: String(form.get("text") ?? ""),
    reply: String(form.get("reply") ?? ""),
    channelIds,
    cooldownSeconds: Number(form.get("cooldownSeconds") ?? 30),
    enabled: was ? form.get("enabled") === "on" : true,
  };
  return save(
    ctx,
    was ? ctx.list.map((r) => (r.id === was.id ? next : r)) : [...ctx.list, next],
    was
      ? `Saved ${next.name.trim() || "the responder"}.`
      : `Added ${next.name.trim() || "a responder"}.`,
  );
}

export async function removeResponder(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  const gone = ctx.list.find((r) => r.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That responder was already removed." });
  return save(
    ctx,
    ctx.list.filter((r) => r.id !== id),
    `Removed ${gone.name}. Undo it from Settings history.`,
  );
}
