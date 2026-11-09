"use server";

import { applySettingsChange, type SettingsModule, undoSettingsChange } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { isDangerousRole } from "@/lib/permissions";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";
import {
  antiRaidForm,
  ledgerForm,
  opsForm,
  parseLadder,
  parseRewards,
  parseStaffRoles,
  pick,
  ranksForm,
  verificationForm,
  watchForm,
} from "@/lib/settings-schema";

/**
 * Every action here re-checks access for the guild named in the form. That
 * value comes from the browser and is never trusted on its own.
 *
 * Each setting is edited on the page it belongs to, so every action names the
 * page and the panel to return to. A failure reopens that panel; a save shows
 * the page with the new values.
 */

interface Place {
  /** Page under /servers/:id. */
  page: "settings" | "watch" | "gatehouse" | "ranks" | "ledger";
  /** The panel's element ID on that page, and its ?edit= value. */
  panel: string;
}

const PLACES = {
  watch: { page: "watch", panel: "settings" },
  ladder: { page: "watch", panel: "edit-ladder" },
  antiRaid: { page: "gatehouse", panel: "anti-raid" },
  verification: { page: "gatehouse", panel: "verification" },
  ranks: { page: "ranks", panel: "settings" },
  rewards: { page: "ranks", panel: "rewards" },
  ledger: { page: "ledger", panel: "settings" },
  ops: { page: "settings", panel: "server" },
  history: { page: "settings", panel: "history" },
} as const satisfies Record<string, Place>;

const saved = (guildId: string, place: Place, what: string) =>
  redirect(`/servers/${guildId}/${place.page}?${new URLSearchParams({ saved: what })}`);

const failed = (guildId: string, place: Place, error: string) =>
  redirect(
    `/servers/${guildId}/${place.page}?${new URLSearchParams({ error, edit: place.panel })}#${place.panel}`,
  );

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
  place: Place,
  what: string = module,
) {
  const { session, guild } = await authorize(form);
  const result = await applySettingsChange(await getDb(), {
    guildId: guild.id,
    module,
    patch,
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok) failed(guild.id, place, result.reason);
  saved(guild.id, place, what);
}

export async function saveWatch(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = watchForm.safeParse(pick(form, ["logChannelId", "dmMembers", "appealText"]));
  if (!parsed.success) failed(guild.id, PLACES.watch, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.logChannelId)))
    failed(guild.id, PLACES.watch, "bad_channel");
  else await save("watch", form, parsed.data, PLACES.watch);
}

/** Anti-raid thresholds, the alert channel and the staff roles that keep talking in a lockdown. */
export async function saveAntiRaid(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = antiRaidForm.safeParse(
    pick(form, [
      "alertChannelId",
      "antiRaidEnabled",
      "raidJoinCount",
      "raidWindowSeconds",
      "raidResponse",
      "autoUnlockMinutes",
      "flagAccountAgeDays",
    ]),
  );
  const staffRoleIds = parseStaffRoles(form);
  if (!parsed.success || !staffRoleIds) failed(guild.id, PLACES.antiRaid, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.alertChannelId)))
    failed(guild.id, PLACES.antiRaid, "bad_channel");
  else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    const known = new Set((roles ?? []).map((r) => r.id));
    if (!roles || !staffRoleIds.every((id) => known.has(id)))
      failed(guild.id, PLACES.antiRaid, "role");
    else
      await save("gatehouse", form, { ...parsed.data, staffRoleIds }, PLACES.antiRaid, "antiraid");
  }
}

export async function saveVerification(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = verificationForm.safeParse(
    pick(form, ["verifyRoleId", "verifyMinAccountAgeDays"]),
  );
  if (!parsed.success) failed(guild.id, PLACES.verification, "range");
  else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    const byId = new Map((roles ?? []).map((r) => [r.id, r]));
    const verify = parsed.data.verifyRoleId ? byId.get(parsed.data.verifyRoleId) : null;
    if (!roles || verify === undefined) failed(guild.id, PLACES.verification, "role");
    // Anyone can press Verify, so the role it gives must carry no admin or moderation powers.
    else if (verify && (verify.managed || isDangerousRole(verify.permissions)))
      failed(guild.id, PLACES.verification, "dangerous_role");
    else await save("gatehouse", form, parsed.data, PLACES.verification, "verification");
  }
}

/** Level rewards are edited on the Ranks page and saved like any other setting. */
export async function saveRewards(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = parseRewards(form);
  if (!parsed.ok) failed(guild.id, PLACES.rewards, `reward_${parsed.error}`);
  else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    const byId = new Map((roles ?? []).map((r) => [r.id, r]));
    const rows = parsed.value.map((r) => byId.get(r.roleId));
    if (!roles || rows.some((r) => !r)) failed(guild.id, PLACES.rewards, "reward_role");
    // Chatting must never earn moderation or admin powers.
    else if (rows.some((r) => r && (r.managed || isDangerousRole(r.permissions))))
      failed(guild.id, PLACES.rewards, "reward_dangerous");
    else await save("rewards", form, { rewards: parsed.value }, PLACES.rewards);
  }
}

export async function saveOps(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = opsForm.safeParse(pick(form, ["timezone"]));
  if (!parsed.success) failed(guild.id, PLACES.ops, "timezone");
  else await save("ops", form, parsed.data, PLACES.ops);
}

export async function saveRanks(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = ranksForm.safeParse(pick(form, ["enabled", "announce", "announceChannelId"]));
  if (!parsed.success) failed(guild.id, PLACES.ranks, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.announceChannelId)))
    failed(guild.id, PLACES.ranks, "bad_channel");
  else await save("ranks", form, parsed.data, PLACES.ranks);
}

export async function saveLedger(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = ledgerForm.safeParse(pick(form, ["channelId", "retentionDays"]));
  if (!parsed.success) failed(guild.id, PLACES.ledger, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.channelId)))
    failed(guild.id, PLACES.ledger, "bad_channel");
  else await save("ledger", form, parsed.data, PLACES.ledger);
}

/** The escalation ladder is edited on the Watch page, and saved like any other setting. */
export async function saveLadder(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = parseLadder(form);
  if (!parsed.success) failed(guild.id, PLACES.ladder, "ladder");
  else await save("escalation", form, { rules: parsed.data }, PLACES.ladder);
}

export async function undoChange(form: FormData) {
  const { session, guild } = await authorize(form);
  const changeId = String(form.get("changeId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(changeId) || !isSnowflake(guild.id))
    failed(guild.id, PLACES.history, "not_found");
  const result = await undoSettingsChange(await getDb(), guild.id, changeId, {
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok) failed(guild.id, PLACES.history, result.reason);
  saved(guild.id, PLACES.history, "undo");
}
