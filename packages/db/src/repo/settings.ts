import { and, asc, desc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  alertSettings,
  automodSettings,
  barracksSettings,
  type EscalationRule,
  escalationRules,
  gatehouseSettings,
  ledgerSettings,
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
  starboardSettings,
  ticketSettings,
  watchSettings,
  welcomeSettings,
} from "../schema";

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
    "backupWeekly",
  ],
  ops: ["timezone", "trackAttendance"],
  // The rank card is checked with checkRankCard before it gets here.
  // Boosts are checked with checkBoosts before they get here.
  ranks: ["enabled", "announce", "announceChannelId", "card", "voiceXp", "boosts"],
  ledger: ["channelId", "retentionDays", "keepMessageText"],
  // The whole ladder is one value, so history and undo treat it as a unit.
  escalation: ["rules"],
  // Templates are checked with checkTemplates before they get here.
  rally: ["templates"],
  // Level rewards are one list too: [{ level, roleId }].
  rewards: ["rewards"],
  // Role menus are checked with checkRoleMenus before they get here.
  roles: ["menus"],
  // Saved messages are checked with checkMessages before they get here.
  messages: ["messages"],
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
  ],
  // Panels are checked with checkTicketPanels, the rest with checkTicketOptions.
  // Feeds are checked with checkAlertFeeds before they get here.
  alerts: ["feeds"],
  // Checked with checkStatRoles before it gets here.
  barracks: ["statRoles"],
  // Checked with checkAutomod before it gets here.
  automod: [
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

async function readRewards(tx: Tx, guildId: string) {
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

async function readLadder(tx: Tx, guildId: string) {
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

const TABLES = {
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
  automod: automodSettings,
  barracks: barracksSettings,
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
]);

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = Record<string, unknown>;

/** JSON with object keys sorted, because JSONB doesn't keep key order. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
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
    // The ladder spans several rows; one lock per server serialises edits to it.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:ladder:${guildId}`}))`);
    return { rules: await readLadder(tx, guildId) };
  }
  const table = TABLES[module];
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
  | { ok: false; reason: "not_found" | "already_undone" | "conflict" | "is_undo" };

/**
 * Undo a change, but only if every field still holds the value it set.
 * Otherwise someone changed it since, and undoing would clobber their edit.
 */
export async function undoSettingsChange(
  db: Db,
  guildId: string,
  changeId: string,
  user: { userId: string; username: string },
): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(settingsChanges)
      .where(and(eq(settingsChanges.guildId, guildId), eq(settingsChanges.id, changeId)));
    if (!original) return { ok: false, reason: "not_found" };
    if (original.revertsChangeId) return { ok: false, reason: "is_undo" };

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
