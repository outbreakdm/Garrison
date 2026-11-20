"use server";

import {
  applySettingsChange,
  checkPublicPage,
  checkVerifyQuestions,
  entitlements,
  getGuildPlan,
  getMemberPages,
  publicSlugTaken,
  type SettingsModule,
  undoSettingsChange,
} from "@garrison/db";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type AutoResult, ERRORS, isAuto, SAVED } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { env } from "@/lib/env";
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
  questions: { page: "gatehouse", panel: "questions" },
  backups: { page: "gatehouse", panel: "backups" },
  ranks: { page: "ranks", panel: "settings" },
  rewards: { page: "ranks", panel: "rewards" },
  ledger: { page: "ledger", panel: "settings" },
  ops: { page: "settings", panel: "server" },
  history: { page: "settings", panel: "history" },
  members: { page: "settings", panel: "members" },
  publicPage: { page: "settings", panel: "public-page" },
} as const satisfies Record<string, Place>;

/**
 * The outcome. A plain post goes back to the page with it in the URL; a form that saves
 * itself (`_auto=1`) gets it as a value, with the page's data refreshed in the same reply.
 */
function saved(
  form: FormData,
  guildId: string,
  place: Place,
  what: string,
  changeId: string | null = null,
): AutoResult {
  if (isAuto(form)) {
    refresh();
    return { status: "saved", message: SAVED[what] ?? "Saved.", changeId };
  }
  redirect(`/servers/${guildId}/${place.page}?${new URLSearchParams({ saved: what })}`);
}

function failed(form: FormData, guildId: string, place: Place, error: string): AutoResult {
  if (isAuto(form))
    return error === "unchanged"
      ? { status: "unchanged" }
      : { status: "error", message: ERRORS[error] ?? "That didn't save. Try again." };
  redirect(
    `/servers/${guildId}/${place.page}?${new URLSearchParams({ error, edit: place.panel })}#${place.panel}`,
  );
}

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
): Promise<AutoResult> {
  const { session, guild } = await authorize(form);
  const result = await applySettingsChange(await getDb(), {
    guildId: guild.id,
    module,
    patch,
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok) return failed(form, guild.id, place, result.reason);
  return saved(form, guild.id, place, what, result.change.id);
}

export async function saveWatch(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = watchForm.safeParse(
    pick(form, ["logChannelId", "dmMembers", "appealText", "appealsEnabled"]),
  );
  if (!parsed.success) return failed(form, guild.id, PLACES.watch, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.logChannelId)))
    return failed(form, guild.id, PLACES.watch, "bad_channel");
  else {
    // With appeals on and no appeal text of their own, the DMs point at the appeal page.
    const data = { ...parsed.data };
    if (data.appealsEnabled && !data.appealText)
      data.appealText = `Appeal here: ${env().APP_URL}/appeal/${guild.id}`;
    return save("watch", form, data, PLACES.watch);
  }
}

/** Anti-raid thresholds, the alert channel and the staff roles that keep talking in a lockdown. */
export async function saveAntiRaid(form: FormData): Promise<AutoResult> {
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
  if (!parsed.success || !staffRoleIds) return failed(form, guild.id, PLACES.antiRaid, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.alertChannelId)))
    return failed(form, guild.id, PLACES.antiRaid, "bad_channel");
  else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    const known = new Set((roles ?? []).map((r) => r.id));
    if (!roles || !staffRoleIds.every((id) => known.has(id)))
      return failed(form, guild.id, PLACES.antiRaid, "role");
    else
      return save("gatehouse", form, { ...parsed.data, staffRoleIds }, PLACES.antiRaid, "antiraid");
  }
}

/** Weekly backups (Pro). A server back on Free can still turn them off. */
export async function saveBackupWeekly(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const on = form.get("backupWeekly") === "on";
  if (on && !entitlements(await getGuildPlan(await getDb(), guild.id))["backups.weekly"])
    return failed(form, guild.id, PLACES.backups, "pro");
  else return save("gatehouse", form, { backupWeekly: on }, PLACES.backups);
}

export async function saveVerification(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = verificationForm.safeParse(
    pick(form, ["verifyRoleId", "verifyMinAccountAgeDays", "verifyWeb"]),
  );
  if (!parsed.success) return failed(form, guild.id, PLACES.verification, "range");
  else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    const byId = new Map((roles ?? []).map((r) => [r.id, r]));
    const verify = parsed.data.verifyRoleId ? byId.get(parsed.data.verifyRoleId) : null;
    if (!roles || verify === undefined) return failed(form, guild.id, PLACES.verification, "role");
    // Anyone can press Verify, so the role it gives must carry no admin or moderation powers.
    else if (verify && (verify.managed || isDangerousRole(verify.permissions)))
      return failed(form, guild.id, PLACES.verification, "dangerous_role");
    else return save("gatehouse", form, parsed.data, PLACES.verification, "verification");
  }
}

/**
 * Verification questions: the list arrives as one JSON value (the editor's rows), checked
 * with the bot's own rules; the answers channel must be one of this server's text channels.
 */
export async function saveVerifyQuestions(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  let list: unknown;
  try {
    list = JSON.parse(String(form.get("verifyQuestions") ?? "[]"));
  } catch {
    return failed(form, guild.id, PLACES.questions, "range");
  }
  const checked = checkVerifyQuestions({
    verifyQuestions: list,
    verifyIntro: String(form.get("verifyIntro") ?? ""),
    verifyReview: form.get("verifyReview") === "on",
    verifyAnswersChannelId: String(form.get("verifyAnswersChannelId") ?? ""),
  });
  if (!checked.ok) {
    if (isAuto(form)) return { status: "error", message: checked.error };
    return failed(form, guild.id, PLACES.questions, "range");
  }
  if (!(await channelBelongs(guild.id, checked.value.verifyAnswersChannelId)))
    return failed(form, guild.id, PLACES.questions, "bad_channel");
  return save("gatehouse", form, { ...checked.value }, PLACES.questions, "questions");
}

/** Level rewards are edited on the Ranks page and saved like any other setting. */
export async function saveRewards(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = parseRewards(form);
  if (!parsed.ok) return failed(form, guild.id, PLACES.rewards, `reward_${parsed.error}`);
  else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    const byId = new Map((roles ?? []).map((r) => [r.id, r]));
    const rows = parsed.value.map((r) => byId.get(r.roleId));
    if (!roles || rows.some((r) => !r))
      return failed(form, guild.id, PLACES.rewards, "reward_role");
    // Chatting must never earn moderation or admin powers.
    else if (rows.some((r) => r && (r.managed || isDangerousRole(r.permissions))))
      return failed(form, guild.id, PLACES.rewards, "reward_dangerous");
    else return save("rewards", form, { rewards: parsed.value }, PLACES.rewards);
  }
}

export async function saveOps(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = opsForm.safeParse(pick(form, ["timezone", "language"]));
  if (!parsed.success) return failed(form, guild.id, PLACES.ops, "timezone");
  else return save("ops", form, parsed.data, PLACES.ops);
}

export async function saveRanks(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = ranksForm.safeParse(
    pick(form, ["enabled", "voiceXp", "announce", "announceChannelId"]),
  );
  if (!parsed.success) return failed(form, guild.id, PLACES.ranks, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.announceChannelId)))
    return failed(form, guild.id, PLACES.ranks, "bad_channel");
  else return save("ranks", form, parsed.data, PLACES.ranks);
}

export async function saveLedger(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = ledgerForm.safeParse(
    pick(form, ["channelId", "retentionDays", "keepMessageText"]),
  );
  if (!parsed.success) return failed(form, guild.id, PLACES.ledger, "range");
  else if (!(await channelBelongs(guild.id, parsed.data.channelId)))
    return failed(form, guild.id, PLACES.ledger, "bad_channel");
  else return save("ledger", form, parsed.data, PLACES.ledger);
}

/** The escalation ladder is edited on the Watch page, and saved like any other setting. */
export async function saveLadder(form: FormData): Promise<AutoResult> {
  const { guild } = await authorize(form);
  const parsed = parseLadder(form);
  if (!parsed.success) return failed(form, guild.id, PLACES.ladder, "ladder");
  else return save("escalation", form, { rules: parsed.data }, PLACES.ladder);
}

export async function undoChange(form: FormData): Promise<AutoResult> {
  const { session, guild, role } = await authorize(form);
  const changeId = String(form.get("changeId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(changeId) || !isSnowflake(guild.id))
    return failed(form, guild.id, PLACES.history, "not_found");
  // Who has access is a manager's to change, so a manager's to undo too.
  const result = await undoSettingsChange(
    await getDb(),
    guild.id,
    changeId,
    { userId: session.userId, username: session.username },
    role === "manager" ? [] : ["access", "members"],
  );
  if (!result.ok) return failed(form, guild.id, PLACES.history, result.reason);
  return saved(form, guild.id, PLACES.history, "undo");
}

/**
 * Which member pages show (docs/MEMBER_PAGES.md). A manager's call, like who has access: it
 * decides what members see about themselves, their own cases included.
 */
/**
 * The server's public page (packages/db public-page.ts): its switches, name, About text and
 * invite. Managers only, like the member pages; a name another server has is refused.
 */
export async function savePublicPage(form: FormData): Promise<AutoResult> {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) return failed(form, guildId, PLACES.publicPage, "forbidden");
  const db = await getDb();
  const [before, plan] = await Promise.all([
    getMemberPages(db, guildId),
    getGuildPlan(db, guildId),
  ]);
  const refuse = (message: string): AutoResult => {
    if (isAuto(form)) return { status: "error", message };
    redirect(`/servers/${guildId}/settings?edit=public-page#public-page`);
  };
  const checked = checkPublicPage(
    {
      publicPage: form.get("publicPage") === "on",
      publicLeaderboard: form.get("publicLeaderboard") === "on",
      publicSlug: form.get("publicSlug") ?? before.publicSlug ?? "",
      publicAbout: form.get("publicAbout") ?? "",
      publicInvite: form.get("publicInvite") ?? "",
    },
    entitlements(plan),
    before,
  );
  if (!checked.ok) return refuse(checked.error);
  if (checked.value.publicSlug && (await publicSlugTaken(db, checked.value.publicSlug, guildId)))
    return refuse("Another server has that name. Try another.");
  return save("members", form, { ...checked.value }, PLACES.publicPage, "publicPage");
}

export async function saveMemberPages(form: FormData): Promise<AutoResult> {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) return failed(form, guildId, PLACES.members, "forbidden");
  return save(
    "members",
    form,
    { showYou: form.get("showYou") === "on", showRecord: form.get("showRecord") === "on" },
    PLACES.members,
  );
}
