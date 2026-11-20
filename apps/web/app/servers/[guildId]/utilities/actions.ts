"use server";

import { randomInt } from "node:crypto";
import {
  applySettingsChange,
  type ClearRule,
  checkClearRules,
  checkStickies,
  entitlements,
  getGuildPlan,
  getUtilitySettings,
  newId,
  readClearRules,
  readStickies,
  type Sticky,
  UTILITY_LIMITS,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Role and channel tools (packages/db utilities.ts). Each edit re-checks access and the
 * plan, keeps channels and roles to this server's, checks the whole list, and saves through
 * Settings history.
 */

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [s, plan] = await Promise.all([
    getUtilitySettings(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return {
    ...access,
    db,
    ent: entitlements(plan),
    settings: s,
    stickies: readStickies(s.stickies),
    clearing: readClearRules(s.clearing),
  };
}
type Ctx = Awaited<ReturnType<typeof load>>;

const back = (guildId: string, outcome: { ok: string } | { error: string }, anchor: string) =>
  flashBack(`/servers/${guildId}/utilities`, outcome, `#${anchor}`);

async function save(ctx: Ctx, patch: Record<string, unknown>, ok: string, anchor: string) {
  const result = await applySettingsChange(ctx.db, {
    guildId: ctx.guild.id,
    module: "utilities",
    patch,
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(
      ctx.guild.id,
      { error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute." },
      anchor,
    );
  return back(ctx.guild.id, { ok }, anchor);
}

async function channelProblem(guildId: string, channelId: string) {
  const channels = await listTextChannels(guildId).catch(() => null);
  if (!channels) return "Discord didn't answer. Try again.";
  if (!channels.some((c) => c.id === channelId)) return "Pick a channel from this server's list.";
  return null;
}

export async function saveRestore(form: FormData) {
  const ctx = await load(form);
  const restoreRoles = form.get("restoreRoles") === "on";
  const skip = [...new Set(form.getAll("restoreSkipRoleIds").map(String).filter(Boolean))];
  if (skip.length > UTILITY_LIMITS.skipRoles)
    return back(ctx.guild.id, { error: `Skip up to ${UTILITY_LIMITS.skipRoles} roles.` }, "rejoin");
  if (skip.length) {
    const roles = await listGuildRoles(ctx.guild.id).catch(() => null);
    if (!roles) return back(ctx.guild.id, { error: "Discord didn't answer. Try again." }, "rejoin");
    if (!skip.every((id) => roles.some((r) => r.id === id)))
      return back(ctx.guild.id, { error: "Pick roles from this server's list." }, "rejoin");
  }
  return save(
    ctx,
    { restoreRoles, restoreSkipRoleIds: skip },
    restoreRoles
      ? "Saved. Members who leave from now on get their roles back when they rejoin."
      : "Saved. Roles back on rejoin is off.",
    "rejoin",
  );
}

export async function saveSticky(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  const was = ctx.stickies.find((s) => s.id === id);
  const channelId = String(form.get("channelId") ?? "");
  const problem = await channelProblem(ctx.guild.id, channelId);
  if (problem) return back(ctx.guild.id, { error: problem }, "stickies");
  const next: Sticky = {
    id: was?.id ?? newId(crypto01),
    channelId,
    text: String(form.get("text") ?? ""),
    enabled: form.get("enabled") !== "off",
  };
  const list = was
    ? ctx.stickies.map((s) => (s.id === was.id ? next : s))
    : [...ctx.stickies, next];
  const checked = checkStickies(list, ctx.ent, ctx.stickies);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, "stickies");
  return save(
    ctx,
    { stickies: checked.value },
    was ? "Saved the sticky message." : "Added. Garrison posts it after the next message there.",
    "stickies",
  );
}

export async function removeSticky(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  if (!ctx.stickies.some((s) => s.id === id))
    return back(ctx.guild.id, { error: "That sticky was already removed." }, "stickies");
  return save(
    ctx,
    { stickies: ctx.stickies.filter((s) => s.id !== id) },
    "Removed. Its last post stays in the channel; delete it there if you like.",
    "stickies",
  );
}

export async function saveClearing(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  const was = ctx.clearing.find((c) => c.id === id);
  const channelId = String(form.get("channelId") ?? "");
  const problem = await channelProblem(ctx.guild.id, channelId);
  if (problem) return back(ctx.guild.id, { error: problem }, "clearing");
  const amount = Number(form.get("amount") ?? 0);
  const unit = form.get("unit") === "days" ? 24 : 1;
  const next: ClearRule = {
    id: was?.id ?? newId(crypto01),
    channelId,
    hours: Math.round(amount * unit),
    keepPinned: form.get("keepPinned") === "on",
    enabled: form.get("enabled") !== "off",
  };
  const list = was
    ? ctx.clearing.map((c) => (c.id === was.id ? next : c))
    : [...ctx.clearing, next];
  const checked = checkClearRules(list, ctx.ent, ctx.clearing);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, "clearing");
  return save(
    ctx,
    { clearing: checked.value },
    was
      ? "Saved the self-clearing channel."
      : "Added. Garrison clears it every 10 minutes; it needs Manage Messages there.",
    "clearing",
  );
}

export async function removeClearing(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  if (!ctx.clearing.some((c) => c.id === id))
    return back(ctx.guild.id, { error: "That one was already removed." }, "clearing");
  return save(
    ctx,
    { clearing: ctx.clearing.filter((c) => c.id !== id) },
    "Removed. That channel's messages stay from now on.",
    "clearing",
  );
}
