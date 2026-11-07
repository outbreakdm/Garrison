"use server";

import { applySettingsChange, type SettingsModule, undoSettingsChange } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";
import {
  gatehouseForm,
  ledgerForm,
  opsForm,
  parseLadder,
  pick,
  ranksForm,
  watchForm,
} from "@/lib/settings-schema";

/**
 * Every action here re-checks access for the guild named in the form. That
 * value comes from the browser and is never trusted on its own.
 */

const back = (guildId: string, query: Record<string, string>, page = "settings") =>
  redirect(`/servers/${guildId}/${page}?${new URLSearchParams(query)}`);

async function authorize(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId);
  // Same answer for "no access" and "no such server".
  if (!access) redirect("/servers");
  return access;
}

/** A channel ID is only accepted if it's a text channel in this server. */
async function channelBelongs(guildId: string, channelId: string | null) {
  if (channelId === null) return true;
  try {
    return (await listTextChannels(guildId)).some((c) => c.id === channelId);
  } catch {
    return false;
  }
}

async function save(
  module: SettingsModule,
  form: FormData,
  patch: Record<string, unknown>,
  page = "settings",
) {
  const { session, guild } = await authorize(form);
  const result = await applySettingsChange(getDb(), {
    guildId: guild.id,
    module,
    patch,
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok) back(guild.id, { error: result.reason }, page);
  back(guild.id, { saved: module }, page);
}

export async function saveWatch(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = watchForm.safeParse(pick(form, ["logChannelId", "dmMembers", "appealText"]));
  if (!parsed.success) back(guild.id, { error: "invalid", module: "watch" });
  else if (!(await channelBelongs(guild.id, parsed.data.logChannelId)))
    back(guild.id, { error: "channel" });
  else await save("watch", form, parsed.data);
}

export async function saveGatehouse(form: FormData) {
  const { guild } = await authorize(form);
  const keys = [
    "alertChannelId",
    "antiRaidEnabled",
    "raidJoinCount",
    "raidWindowSeconds",
    "raidResponse",
    "autoUnlockMinutes",
    "flagAccountAgeDays",
  ];
  const parsed = gatehouseForm.safeParse(pick(form, keys));
  if (!parsed.success) back(guild.id, { error: "invalid", module: "gatehouse" });
  else if (!(await channelBelongs(guild.id, parsed.data.alertChannelId)))
    back(guild.id, { error: "channel" });
  else await save("gatehouse", form, parsed.data);
}

export async function saveOps(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = opsForm.safeParse(pick(form, ["timezone"]));
  if (!parsed.success) back(guild.id, { error: "timezone" });
  else await save("ops", form, parsed.data);
}

export async function saveRanks(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = ranksForm.safeParse(pick(form, ["enabled", "announce", "announceChannelId"]));
  if (!parsed.success) back(guild.id, { error: "invalid", module: "ranks" });
  else if (!(await channelBelongs(guild.id, parsed.data.announceChannelId)))
    back(guild.id, { error: "channel" });
  else await save("ranks", form, parsed.data);
}

export async function saveLedger(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = ledgerForm.safeParse(pick(form, ["channelId", "retentionDays"]));
  if (!parsed.success) back(guild.id, { error: "invalid", module: "ledger" });
  else if (!(await channelBelongs(guild.id, parsed.data.channelId)))
    back(guild.id, { error: "channel" });
  else await save("ledger", form, parsed.data);
}

/** The escalation ladder is edited on the Watch page, and saved like any other setting. */
export async function saveLadder(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = parseLadder(form);
  if (!parsed.success) back(guild.id, { error: "ladder" }, "watch");
  else await save("escalation", form, { rules: parsed.data }, "watch");
}

export async function undoChange(form: FormData) {
  const { session, guild } = await authorize(form);
  const changeId = String(form.get("changeId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(changeId) || !isSnowflake(guild.id))
    back(guild.id, { error: "not_found" });
  const result = await undoSettingsChange(getDb(), guild.id, changeId, {
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok) back(guild.id, { error: result.reason });
  back(guild.id, { saved: "undo" });
}
