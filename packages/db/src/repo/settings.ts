import { and, asc, desc, eq, getTableName, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  alertSettings,
  applicationSettings,
  automodSettings,
  barracksSettings,
  dashboardAccess,
  type EscalationRule,
  economySettings,
  escalationRules,
  funSettings,
  gatehouseSettings,
  guilds,
  inviteSettings,
  ledgerSettings,
  memberPages,
  messageSettings,
  opsSettings,
  rallySettings,
  rankRewards,
  ranksSettings,
  roleMenuSettings,
  type SettingsChange,
  type SettingsDiff,
  type SettingsModule,
  settingsChanges,
  settingsModule,
  starboardSettings,
  statsSettings,
  suggestionSettings,
  ticketSettings,
  utilitySettings,
  voiceSettings,
  watchSettings,
  welcomeSettings,
} from "../schema";

/** Every settings module, in the database enum's order. */
export const SETTINGS_MODULES = settingsModule.enumValues as SettingsModule[];

/**
 * The only fields the dashboard may change, per module. Anything else in a
 * patch is ignored. Anti-nuke settings and the trusted list are deliberately
 * absent: they stay owner-only commands in Discord.
 */
export const EDITABLE_FIELDS = {
  watch: ["logChannelId", "dmMembers", "appealText", "appealsEnabled"],
  gatehouse: [
    "alertChannelId",
    "antiRaidEnabled",
    "raidJoinCount",
    "raidWindowSeconds",
    "raidResponse",
    "autoUnlockMinutes",
    "flagAccountAgeDays",
    "staffRoleIds",
    "verifyRoleId",
    "verifyMinAccountAgeDays",
    "verifyWeb",
    // Checked with checkVerifyQuestions before they get here.
    "verifyQuestions",
    "verifyIntro",
    "verifyReview",
    "verifyAnswersChannelId",
    "backupWeekly",
  ],
  ops: ["timezone", "trackAttendance", "language"],
  // The rank card is checked with checkRankCard before it gets here.
  // Boosts are checked with checkBoosts before they get here.
  ranks: ["enabled", "announce", "announceChannelId", "card", "voiceXp", "boosts"],
  ledger: ["channelId", "retentionDays", "keepMessageText"],
  // The whole ladder is one value, so history and undo treat it as a unit.
  escalation: ["rules"],
  // Templates are checked with checkTemplates before they get here.
  // Templates with checkTemplates, the LFG panel with checkLfgPanel. Where the panel is posted
  // is the bot's to record (setLfgPanelMessage), not a setting.
  rally: [
    "templates",
    "lfgPanelTitle",
    "lfgPanelBody",
    "lfgPanelTemplates",
    "lfgPanelOther",
    "lfgPanelSticky",
  ],
  // Level rewards are one list too: [{ level, roleId }].
  rewards: ["rewards"],
  // Role menus are checked with checkRoleMenus before they get here.
  roles: ["menus"],
  // Saved messages are checked with checkMessages before they get here.
  messages: ["messages", "responders"],
  // Application forms are checked with checkApplicationForms before they get here.
  applications: ["forms"],
  // Stickies and self-clearing channels are checked with checkStickies and checkClearRules.
  utilities: ["restoreRoles", "restoreSkipRoleIds", "stickies", "clearing"],
  // Channels and roles are checked against the server before they get here.
  fun: [
    "birthdaysEnabled",
    "birthdayChannelId",
    "birthdayRoleId",
    "countingEnabled",
    "countingChannelId",
  ],
  // Who else may use the dashboard; checked with checkAccessGrants before it gets here.
  access: ["grants"],
  // Which member pages show (docs/MEMBER_PAGES.md).
  // The public page's fields are checked with checkPublicPage before they get here.
  members: [
    "showYou",
    "showRecord",
    "publicPage",
    "publicLeaderboard",
    "publicSlug",
    "publicAbout",
    "publicInvite",
  ],
  // Cards are checked with checkWelcome before they get here.
  welcome: [
    "joinEnabled",
    "joinChannelId",
    "joinCard",
    "leaveEnabled",
    "leaveChannelId",
    "leaveCard",
    "dmEnabled",
    "dmCard",
    "joinRoleIds",
    "joinImage",
    "joinImageAlone",
    "joinImagePing",
    "joinImageTop",
    "joinImageBottom",
  ],
  // Panels are checked with checkTicketPanels, the rest with checkTicketOptions.
  // Feeds are checked with checkAlertFeeds before they get here.
  alerts: ["feeds"],
  // Checked with checkStatRoles before it gets here.
  barracks: ["statRoles"],
  // Checked with checkAutomod before it gets here.
  automod: [
    "scamLinks",
    "enabled",
    "invites",
    "mentionLimit",
    "spamCount",
    "spamSeconds",
    "words",
    "action",
    "timeoutMinutes",
    "exemptRoleIds",
    "exemptChannelIds",
    "aiEnabled",
    "aiCategories",
    "aiStrictness",
    // Patterns are checked with patternProblem; Discord's AutoMod runs them.
    "regexPatterns",
    "regexAllow",
  ],
  // Checked with checkSuggestions before it gets here.
  // The board with checkSuggestions, the panel and its form with checkSuggestionPanel. Where
  // the panel is posted is the bot's to record (setSuggestionPanelMessage), not a setting.
  suggestions: [
    "enabled",
    "channelId",
    "anonymous",
    "panelTitle",
    "panelBody",
    "buttonLabel",
    "questions",
    "panelSticky",
  ],
  // Checked with checkVoiceRooms before it gets here.
  voice: ["enabled", "creatorChannelIds", "nameTemplate", "userLimit", "categoryId", "controls"],
  // Checked with checkServerStats before it gets here.
  stats: ["enabled", "counters", "categoryId"],
  // Checked with checkInviteLabels before it gets here.
  invites: ["labels"],
  // Checked with checkEconomy before it gets here.
  // The shop panel's words too (checkShopPanel); where it's posted is the bot's to record.
  economy: [
    "enabled",
    "currency",
    "earn",
    "shop",
    "staffChannelId",
    "noEarnChannelIds",
    "shopPanelTitle",
    "shopPanelBody",
  ],
  // Checked with checkStarboard before it gets here.
  starboard: [
    "enabled",
    "channelId",
    "emoji",
    "threshold",
    "selfStar",
    "ignoredChannelIds",
    "accent",
  ],
  tickets: [
    "panels",
    "staffRoleIds",
    "parentId",
    "logChannelId",
    "maxOpen",
    "pingStaff",
    "autoAssign",
    "modmail",
  ],
} as const satisfies Record<SettingsModule, readonly string[]>;

/** One step of the escalation ladder, as the dashboard edits it and history stores it. */
export interface LadderStep {
  warnCount: number;
  windowMinutes: number;
  action: EscalationRule["action"];
  durationSeconds: number | null;
}

/** Same keys, same order, sorted by threshold: so equal ladders compare equal as JSON. */
export function normalizeLadder(steps: LadderStep[]): LadderStep[] {
  return [...steps]
    .sort((a, b) => a.warnCount - b.warnCount)
    .map((r) => ({
      warnCount: r.warnCount,
      windowMinutes: r.windowMinutes,
      action: r.action,
      durationSeconds: r.action === "timeout" ? r.durationSeconds : null,
    }));
}

/** One level reward, as the dashboard edits it. */
export interface RewardStep {
  level: number;
  roleId: string;
}

export function normalizeRewards(steps: RewardStep[]): RewardStep[] {
  return [...steps]
    .sort((a, b) => a.level - b.level)
    .map((r) => ({ level: r.level, roleId: r.roleId }));
}

async function readRewards(tx: Db, guildId: string) {
  const rows = await tx
    .select({ level: rankRewards.level, roleId: rankRewards.roleId })
    .from(rankRewards)
    .where(and(eq(rankRewards.guildId, guildId), isNotNull(rankRewards.roleId)));
  return normalizeRewards(rows as RewardStep[]);
}

/** Make the active rewards exactly `rewards`. Removed levels keep their row with no role. */
async function writeRewards(tx: Tx, guildId: string, rewards: RewardStep[]) {
  for (const r of rewards) {
    await tx
      .insert(rankRewards)
      .values({ guildId, level: r.level, roleId: r.roleId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [rankRewards.guildId, rankRewards.level],
        set: { roleId: r.roleId, updatedAt: new Date() },
      });
  }
  const keep = rewards.map((r) => r.level);
  await tx
    .update(rankRewards)
    .set({ roleId: null, updatedAt: new Date() })
    .where(
      and(
        eq(rankRewards.guildId, guildId),
        isNotNull(rankRewards.roleId),
        keep.length ? notInArray(rankRewards.level, keep) : sql`true`,
      ),
    );
}

async function readLadder(tx: Db, guildId: string) {
  const rows = await tx
    .select()
    .from(escalationRules)
    .where(and(eq(escalationRules.guildId, guildId), eq(escalationRules.enabled, true)))
    .orderBy(asc(escalationRules.warnCount));
  return normalizeLadder(rows);
}

/** Make the enabled rules exactly `ladder`. Steps that go away are switched off, never deleted. */
async function writeLadder(tx: Tx, guildId: string, ladder: LadderStep[]) {
  for (const step of ladder) {
    await tx
      .insert(escalationRules)
      .values({ guildId, ...step, enabled: true })
      .onConflictDoUpdate({
        target: [escalationRules.guildId, escalationRules.warnCount],
        set: {
          windowMinutes: step.windowMinutes,
          action: step.action,
          durationSeconds: step.durationSeconds,
          enabled: true,
        },
      });
  }
  const keep = ladder.map((s) => s.warnCount);
  await tx
    .update(escalationRules)
    .set({ enabled: false })
    .where(
      and(
        eq(escalationRules.guildId, guildId),
        eq(escalationRules.enabled, true),
        keep.length ? notInArray(escalationRules.warnCount, keep) : sql`true`,
      ),
    );
}

export const SETTINGS_TABLES = {
  watch: watchSettings,
  gatehouse: gatehouseSettings,
  ops: opsSettings,
  ranks: ranksSettings,
  ledger: ledgerSettings,
  rally: rallySettings,
  roles: roleMenuSettings,
  welcome: welcomeSettings,
  messages: messageSettings,
  tickets: ticketSettings,
  alerts: alertSettings,
  starboard: starboardSettings,
  voice: voiceSettings,
  suggestions: suggestionSettings,
  automod: automodSettings,
  barracks: barracksSettings,
  access: dashboardAccess,
  members: memberPages,
  stats: statsSettings,
  invites: inviteSettings,
  economy: economySettings,
  applications: applicationSettings,
  utilities: utilitySettings,
  fun: funSettings,
} as const;

/** Modules whose settings row is created on first use, by the bot or the dashboard. */
const LAZY = new Set<SettingsModule>([
  "ops",
  "ranks",
  "ledger",
  "rally",
  "roles",
  "welcome",
  "messages",
  "tickets",
  "alerts",
  "starboard",
  "automod",
  "barracks",
  "voice",
  "suggestions",
  "access",
  "members",
  "stats",
  "invites",
  "economy",
  "applications",
  "utilities",
  "fun",
]);

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = Record<string, unknown>;

/**
 * JSON with object keys sorted, because JSONB doesn't keep key order, and a key that is null
 * counted as missing: a card saved before a field existed equals the same card with that
 * field empty, so re-saving it isn't a change (and never lands in Settings history).
 */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Row)[k] != null)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Row)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

async function lockRow(tx: Tx, module: SettingsModule, guildId: string): Promise<Row | null> {
  if (module === "rewards") {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:rewards:${guildId}`}))`);
    return { rewards: await readRewards(tx, guildId) };
  }
  if (module === "escalation") {
    // The ladder spans several rows; one lock per server serializes edits to it.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:ladder:${guildId}`}))`);
    return { rules: await readLadder(tx, guildId) };
  }
  const table = SETTINGS_TABLES[module];
  if (LAZY.has(module)) {
    // These rows are created lazily, with the column defaults.
    await tx
      .insert(table as typeof opsSettings)
      .values({ guildId })
      .onConflictDoNothing();
  }
  const [row] = await tx.select().from(table).where(eq(table.guildId, guildId)).for("update");
  return (row as Row | undefined) ?? null;
}

/**
 * A module's editable settings as they are now, read only: exactly the fields in
 * EDITABLE_FIELDS. Null when the module has never been set up here, so its defaults
 * apply (most modules start off). The AI assistant's chat reads settings through this.
 */
export async function readSettings(
  db: Db,
  guildId: string,
  module: SettingsModule,
): Promise<Record<string, unknown> | null> {
  if (module === "rewards") {
    const rewards = await readRewards(db, guildId);
    return rewards.length ? { rewards } : null;
  }
  if (module === "escalation") {
    const rules = await readLadder(db, guildId);
    return rules.length ? { rules } : null;
  }
  const table = SETTINGS_TABLES[module];
  const [row] = (await db.select().from(table).where(eq(table.guildId, guildId))) as Row[];
  if (!row) return null;
  return Object.fromEntries(EDITABLE_FIELDS[module].map((f) => [f, row[f] ?? null]));
}

/**
 * Several modules' settings in one round trip, each exactly as readSettings gives it: one
 * query that joins every module's table to the server's row. The dashboard reads sixteen
 * modules on every page for its menu, and where the database is a continent away from the
 * page, one query instead of sixteen is most of a page's wait. Rewards and the warning
 * ladder span several rows, so they're read on their own; so is everything when the
 * server's row is missing.
 */
export async function readManySettings(
  db: Db,
  guildId: string,
  modules: readonly SettingsModule[],
): Promise<Map<SettingsModule, Record<string, unknown> | null>> {
  const out = new Map<SettingsModule, Record<string, unknown> | null>();
  const wanted = [...new Set(modules)];
  const joined = wanted.filter((m): m is keyof typeof SETTINGS_TABLES => m in SETTINGS_TABLES);
  const alone: SettingsModule[] = wanted.filter((m) => !(m in SETTINGS_TABLES));
  if (joined.length) {
    type Query = ReturnType<typeof base>;
    const base = () => db.select().from(guilds).$dynamic();
    let query: Query = base();
    for (const m of joined) {
      const table = SETTINGS_TABLES[m];
      query = query.leftJoin(table, eq(table.guildId, guilds.id)) as unknown as Query;
    }
    const [row] = (await query.where(eq(guilds.id, guildId))) as unknown as Record<
      string,
      Row | null
    >[];
    if (row)
      for (const m of joined) {
        const found = row[getTableName(SETTINGS_TABLES[m])];
        out.set(
          m,
          found ? Object.fromEntries(EDITABLE_FIELDS[m].map((f) => [f, found[f] ?? null])) : null,
        );
      }
    else alone.push(...joined);
  }
  await Promise.all(alone.map(async (m) => out.set(m, await readSettings(db, guildId, m))));
  return out;
}

/** Write whitelisted values. Callers only pass fields from EDITABLE_FIELDS. */
async function writeRow(tx: Tx, module: SettingsModule, guildId: string, values: Row) {
  if (module === "escalation") {
    await writeLadder(tx, guildId, normalizeLadder(values.rules as LadderStep[]));
    return;
  }
  if (module === "rewards") {
    await writeRewards(tx, guildId, normalizeRewards(values.rewards as RewardStep[]));
    return;
  }
  const set = { ...values, updatedAt: new Date() };
  switch (module) {
    case "watch":
      await tx
        .update(watchSettings)
        .set(set as Partial<typeof watchSettings.$inferInsert>)
        .where(eq(watchSettings.guildId, guildId));
      return;
    case "gatehouse":
      await tx
        .update(gatehouseSettings)
        .set(set as Partial<typeof gatehouseSettings.$inferInsert>)
        .where(eq(gatehouseSettings.guildId, guildId));
      return;
    case "ops":
      await tx
        .update(opsSettings)
        .set(set as Partial<typeof opsSettings.$inferInsert>)
        .where(eq(opsSettings.guildId, guildId));
      return;
    case "ranks":
      await tx
        .update(ranksSettings)
        .set(set as Partial<typeof ranksSettings.$inferInsert>)
        .where(eq(ranksSettings.guildId, guildId));
      return;
    case "ledger":
      await tx
        .update(ledgerSettings)
        .set(set as Partial<typeof ledgerSettings.$inferInsert>)
        .where(eq(ledgerSettings.guildId, guildId));
      return;
    case "rally":
      await tx
        .update(rallySettings)
        .set(set as Partial<typeof rallySettings.$inferInsert>)
        .where(eq(rallySettings.guildId, guildId));
      return;
    case "messages":
      await tx
        .update(messageSettings)
        .set(set as Partial<typeof messageSettings.$inferInsert>)
        .where(eq(messageSettings.guildId, guildId));
      return;
    case "access":
      await tx
        .update(dashboardAccess)
        .set(set as Partial<typeof dashboardAccess.$inferInsert>)
        .where(eq(dashboardAccess.guildId, guildId));
      return;
    case "members":
      await tx
        .update(memberPages)
        .set(set as Partial<typeof memberPages.$inferInsert>)
        .where(eq(memberPages.guildId, guildId));
      return;
    case "welcome":
      await tx
        .update(welcomeSettings)
        .set(set as Partial<typeof welcomeSettings.$inferInsert>)
        .where(eq(welcomeSettings.guildId, guildId));
      return;
    case "automod":
      await tx
        .update(automodSettings)
        .set(set as Partial<typeof automodSettings.$inferInsert>)
        .where(eq(automodSettings.guildId, guildId));
      return;
    case "barracks":
      await tx
        .update(barracksSettings)
        .set(set as Partial<typeof barracksSettings.$inferInsert>)
        .where(eq(barracksSettings.guildId, guildId));
      return;
    case "suggestions":
      await tx
        .update(suggestionSettings)
        .set(set as Partial<typeof suggestionSettings.$inferInsert>)
        .where(eq(suggestionSettings.guildId, guildId));
      return;
    case "voice":
      await tx
        .update(voiceSettings)
        .set(set as Partial<typeof voiceSettings.$inferInsert>)
        .where(eq(voiceSettings.guildId, guildId));
      return;
    case "economy":
      await tx
        .update(economySettings)
        .set(set as Partial<typeof economySettings.$inferInsert>)
        .where(eq(economySettings.guildId, guildId));
      return;
    case "invites":
      await tx
        .update(inviteSettings)
        .set(set as Partial<typeof inviteSettings.$inferInsert>)
        .where(eq(inviteSettings.guildId, guildId));
      return;
    case "stats":
      await tx
        .update(statsSettings)
        .set(set as Partial<typeof statsSettings.$inferInsert>)
        .where(eq(statsSettings.guildId, guildId));
      return;
    case "starboard":
      await tx
        .update(starboardSettings)
        .set(set as Partial<typeof starboardSettings.$inferInsert>)
        .where(eq(starboardSettings.guildId, guildId));
      return;
    case "alerts":
      await tx
        .update(alertSettings)
        .set(set as Partial<typeof alertSettings.$inferInsert>)
        .where(eq(alertSettings.guildId, guildId));
      return;
    case "tickets":
      await tx
        .update(ticketSettings)
        .set(set as Partial<typeof ticketSettings.$inferInsert>)
        .where(eq(ticketSettings.guildId, guildId));
      return;
    case "roles":
      await tx
        .update(roleMenuSettings)
        .set(set as Partial<typeof roleMenuSettings.$inferInsert>)
        .where(eq(roleMenuSettings.guildId, guildId));
      return;
    case "applications":
      await tx
        .update(applicationSettings)
        .set(set as Partial<typeof applicationSettings.$inferInsert>)
        .where(eq(applicationSettings.guildId, guildId));
      return;
    case "utilities":
      await tx
        .update(utilitySettings)
        .set(set as Partial<typeof utilitySettings.$inferInsert>)
        .where(eq(utilitySettings.guildId, guildId));
      return;
    case "fun":
      await tx
        .update(funSettings)
        .set(set as Partial<typeof funSettings.$inferInsert>)
        .where(eq(funSettings.guildId, guildId));
      return;
  }
}

export interface ApplyInput {
  guildId: string;
  module: SettingsModule;
  patch: Record<string, unknown>;
  userId: string;
  username: string;
}

export type ApplyResult =
  | { ok: true; change: SettingsChange }
  | { ok: false; reason: "unchanged" | "not_ready" };

/** Apply a whitelisted patch and record exactly what changed, in one transaction. */
export async function applySettingsChange(db: Db, input: ApplyInput): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const row = await lockRow(tx, input.module, input.guildId);
    if (!row) return { ok: false, reason: "not_ready" };

    const diff: SettingsDiff = {};
    const values: Row = {};
    const patch =
      input.module === "escalation" && Array.isArray(input.patch.rules)
        ? { rules: normalizeLadder(input.patch.rules as LadderStep[]) }
        : input.module === "rewards" && Array.isArray(input.patch.rewards)
          ? { rewards: normalizeRewards(input.patch.rewards as RewardStep[]) }
          : input.patch;
    for (const field of EDITABLE_FIELDS[input.module] as readonly string[]) {
      if (!(field in patch)) continue;
      const to = patch[field];
      if (same(row[field], to)) continue;
      diff[field] = { from: row[field] ?? null, to: to ?? null };
      values[field] = to;
    }
    if (!Object.keys(diff).length) return { ok: false, reason: "unchanged" };

    await writeRow(tx, input.module, input.guildId, values);
    const [change] = await tx
      .insert(settingsChanges)
      .values({
        guildId: input.guildId,
        module: input.module,
        changes: diff,
        userId: input.userId,
        username: input.username,
      })
      .returning();
    if (!change) throw new Error("Change insert returned no row");
    return { ok: true, change };
  });
}

export type UndoResult =
  | { ok: true; change: SettingsChange }
  | { ok: false; reason: "not_found" | "already_undone" | "conflict" | "is_undo" | "forbidden" };

/**
 * Undo a change, but only if every field still holds the value it set.
 * Otherwise someone changed it since, and undoing would clobber their edit.
 */
export async function undoSettingsChange(
  db: Db,
  guildId: string,
  changeId: string,
  user: { userId: string; username: string },
  /** Modules this person may not change, so may not undo either (access, for non-managers). */
  forbid: readonly SettingsModule[] = [],
): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(settingsChanges)
      .where(and(eq(settingsChanges.guildId, guildId), eq(settingsChanges.id, changeId)));
    if (!original) return { ok: false, reason: "not_found" };
    if (original.revertsChangeId) return { ok: false, reason: "is_undo" };
    if (forbid.includes(original.module)) return { ok: false, reason: "forbidden" };

    const row = await lockRow(tx, original.module, guildId);
    if (!row) return { ok: false, reason: "not_found" };
    const [existing] = await tx
      .select({ id: settingsChanges.id })
      .from(settingsChanges)
      .where(eq(settingsChanges.revertsChangeId, changeId));
    if (existing) return { ok: false, reason: "already_undone" };

    const allowed = EDITABLE_FIELDS[original.module] as readonly string[];
    const diff: SettingsDiff = {};
    const values: Row = {};
    for (const [field, { from, to }] of Object.entries(original.changes)) {
      if (!allowed.includes(field)) continue;
      if (!same(row[field], to)) return { ok: false, reason: "conflict" };
      diff[field] = { from: to, to: from };
      values[field] = from;
    }
    await writeRow(tx, original.module, guildId, values);
    const [change] = await tx
      .insert(settingsChanges)
      .values({
        guildId,
        module: original.module,
        changes: diff,
        revertsChangeId: changeId,
        ...user,
      })
      .returning();
    if (!change) throw new Error("Undo insert returned no row");
    return { ok: true, change };
  });
}

export async function listSettingsChanges(db: Db, guildId: string, limit = 20) {
  return db
    .select()
    .from(settingsChanges)
    .where(eq(settingsChanges.guildId, guildId))
    .orderBy(desc(settingsChanges.createdAt))
    .limit(limit);
}

/** Which member pages this server shows: "You" on and "Your record" off until set. */
export async function getMemberPages(db: Db, guildId: string) {
  const [row] = await db.select().from(memberPages).where(eq(memberPages.guildId, guildId));
  return {
    showYou: row?.showYou ?? true,
    showRecord: row?.showRecord ?? false,
    publicPage: row?.publicPage ?? false,
    publicLeaderboard: row?.publicLeaderboard ?? false,
    publicSlug: row?.publicSlug ?? null,
    publicAbout: row?.publicAbout ?? null,
    publicInvite: row?.publicInvite ?? null,
  };
}

/**
 * A public page by its name or its server's ID, only while it's on and Garrison is still in
 * the server. Null otherwise, so a page that's off can't be told apart from one never made.
 */
export async function getPublicPage(db: Db, key: string) {
  const k = key.toLowerCase();
  if (!/^[a-z0-9-]{3,32}$/.test(k) && !/^\d{17,20}$/.test(k)) return null;
  const [row] = await db
    .select({
      guildId: memberPages.guildId,
      name: guilds.name,
      publicLeaderboard: memberPages.publicLeaderboard,
      publicSlug: memberPages.publicSlug,
      publicAbout: memberPages.publicAbout,
      publicInvite: memberPages.publicInvite,
    })
    .from(memberPages)
    .innerJoin(guilds, eq(guilds.id, memberPages.guildId))
    .where(
      and(
        eq(memberPages.publicPage, true),
        isNull(guilds.leftAt),
        /^\d+$/.test(k) ? eq(memberPages.guildId, k) : eq(memberPages.publicSlug, k),
      ),
    );
  return row ?? null;
}

/** Whether another server already has this public page name. */
export async function publicSlugTaken(db: Db, slug: string, guildId: string) {
  const [row] = await db
    .select({ guildId: memberPages.guildId })
    .from(memberPages)
    .where(eq(memberPages.publicSlug, slug));
  return !!row && row.guildId !== guildId;
}
