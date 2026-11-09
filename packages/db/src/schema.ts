import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { GuildPlan, RallyTemplate, RallyWording } from "./rally";

/**
 * Every table enables row-level security with no policies. The bot and the
 * dashboard's server code connect as a privileged role, so Supabase's public
 * REST API (anon/authenticated keys) can read nothing until we add policies.
 */

/** One row per Discord server Garrison has joined. IDs are Discord snowflakes. */
export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Last case number handed out. Incremented atomically when a case is created. */
  caseCounter: integer("case_counter").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
}).enableRLS();

/** Watch (moderation) settings, one row per guild. */
export const watchSettings = pgTable("watch_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  /** Channel that receives a log embed for every case. Null means no log. */
  logChannelId: text("log_channel_id"),
  /** DM members when they are warned, timed out, kicked or banned. */
  dmMembers: boolean("dm_members").notNull().default(true),
  /** Shown in moderation DMs under "How to appeal". */
  appealText: text("appeal_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const caseAction = pgEnum("case_action", ["warn", "timeout", "kick", "ban", "purge"]);
export const caseSource = pgEnum("case_source", ["manual", "escalation", "automod"]);
export const escalationAction = pgEnum("escalation_action", ["timeout", "kick", "ban"]);

/** A moderation case. Case numbers are per guild and never reused. */
export const modCases = pgTable(
  "mod_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    caseNumber: integer("case_number").notNull(),
    action: caseAction("action").notNull(),
    source: caseSource("source").notNull().default("manual"),
    /** Member the action targets. Null for channel-wide actions such as purge. */
    targetId: text("target_id"),
    targetTag: text("target_tag"),
    moderatorId: text("moderator_id").notNull(),
    moderatorTag: text("moderator_tag").notNull(),
    reason: text("reason"),
    durationSeconds: integer("duration_seconds"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Action-specific details, e.g. { channelId, deleted } for purge. */
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    /** Set when a case is undone. Revoked warnings stop counting toward escalation. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: text("revoked_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mod_cases_guild_case_number").on(t.guildId, t.caseNumber),
    index("mod_cases_guild_target_created").on(t.guildId, t.targetId, t.createdAt),
  ],
).enableRLS();

/**
 * Escalation rules: when a member collects `warnCount` active warnings within
 * `windowMinutes`, Garrison applies `action` automatically.
 */
export const escalationRules = pgTable(
  "escalation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    warnCount: integer("warn_count").notNull(),
    windowMinutes: integer("window_minutes").notNull(),
    action: escalationAction("action").notNull(),
    /** Required for timeout; ignored for kick and ban. */
    durationSeconds: integer("duration_seconds"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("escalation_rules_guild_count").on(t.guildId, t.warnCount),
    index("escalation_rules_guild").on(t.guildId).where(sql`${t.enabled}`),
    check("escalation_warn_count", sql`${t.warnCount} BETWEEN 1 AND 50`),
    check("escalation_window", sql`${t.windowMinutes} BETWEEN 1 AND 525600`),
    // Discord caps a timeout at 28 days.
    check(
      "escalation_duration",
      sql`${t.durationSeconds} IS NULL OR ${t.durationSeconds} BETWEEN 1 AND 2419200`,
    ),
    check(
      "escalation_timeout_needs_duration",
      sql`${t.action} <> 'timeout' OR ${t.durationSeconds} IS NOT NULL`,
    ),
  ],
).enableRLS();

export type Guild = typeof guilds.$inferSelect;
export type WatchSettings = typeof watchSettings.$inferSelect;
export type ModCase = typeof modCases.$inferSelect;
export type NewModCase = Omit<typeof modCases.$inferInsert, "id" | "caseNumber" | "createdAt">;
export type EscalationRule = typeof escalationRules.$inferSelect;
export type CaseAction = (typeof caseAction.enumValues)[number];
export type EscalationAction = (typeof escalationAction.enumValues)[number];

// ---------------------------------------------------------------------------
// Gatehouse (security)
// ---------------------------------------------------------------------------

export const raidResponse = pgEnum("raid_response", ["alert", "lockdown"]);
export const lockdownSource = pgEnum("lockdown_source", ["manual", "anti_raid"]);

/** Gatehouse settings, one row per guild. */
export const gatehouseSettings = pgTable(
  "gatehouse_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    /** Channel for raid alerts, lockdown notices and new-account flags. Null falls back to the Watch log channel. */
    alertChannelId: text("alert_channel_id"),
    antiRaidEnabled: boolean("anti_raid_enabled").notNull().default(true),
    /** A raid is `raidJoinCount` joins within `raidWindowSeconds`. */
    raidJoinCount: integer("raid_join_count").notNull().default(10),
    raidWindowSeconds: integer("raid_window_seconds").notNull().default(30),
    raidResponse: raidResponse("raid_response").notNull().default("lockdown"),
    /** Anti-raid lockdowns lift on their own after this long. */
    autoUnlockMinutes: integer("auto_unlock_minutes").notNull().default(15),
    /** Flag joining accounts younger than this many days. 0 turns flags off. */
    flagAccountAgeDays: integer("flag_account_age_days").notNull().default(7),
    /** Roles that keep talking during a lockdown. */
    staffRoleIds: text("staff_role_ids").array().notNull().default(sql`'{}'::text[]`),
    /** Role the verification button gives. Null means verification is off. */
    verifyRoleId: text("verify_role_id"),
    verifyMinAccountAgeDays: integer("verify_min_account_age_days").notNull().default(0),
    /** Anti-nuke: stop one actor deleting channels/roles or mass-banning. Owner-only to change. */
    antiNukeEnabled: boolean("anti_nuke_enabled").notNull().default(true),
    /** Users and bots anti-nuke never acts on. The owner is always trusted. Owner-only to change. */
    antiNukeTrustedIds: text("anti_nuke_trusted_ids").array().notNull().default(sql`'{}'::text[]`),
    /** Channel or role deletions by one actor within the window that count as a nuke. */
    nukeDeleteThreshold: integer("nuke_delete_threshold").notNull().default(3),
    /** Bans plus kicks by one actor within the window that count as a nuke. */
    nukeBanThreshold: integer("nuke_ban_threshold").notNull().default(5),
    nukeWindowSeconds: integer("nuke_window_seconds").notNull().default(60),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("gatehouse_verify_age", sql`${t.verifyMinAccountAgeDays} BETWEEN 0 AND 365`),
    check("gatehouse_staff_roles", sql`cardinality(${t.staffRoleIds}) <= 10`),
  ],
).enableRLS();

/** One permission overwrite as it was before a lockdown. `before: null` means there was none. */
export interface LockdownSnapshotEntry {
  channelId: string;
  targetId: string;
  /** 0 = role, 1 = member (Discord's overwrite types). */
  type: 0 | 1;
  before: { allow: string; deny: string } | null;
}

/** A lockdown, with the exact overwrites needed to restore every channel. */
export const lockdowns = pgTable(
  "lockdowns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    source: lockdownSource("source").notNull(),
    reason: text("reason"),
    startedById: text("started_by_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** When it lifts on its own. Null means it waits for /lockdown end. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    invitesPaused: boolean("invites_paused").notNull().default(false),
    snapshot: jsonb("snapshot").$type<LockdownSnapshotEntry[]>().notNull().default([]),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedById: text("ended_by_id"),
  },
  (t) => [
    uniqueIndex("lockdowns_one_active_per_guild").on(t.guildId).where(sql`${t.endedAt} is null`),
    index("lockdowns_active_ends_at").on(t.endsAt).where(sql`${t.endedAt} is null`),
  ],
).enableRLS();

export type GatehouseSettings = typeof gatehouseSettings.$inferSelect;
export type Lockdown = typeof lockdowns.$inferSelect;
export type RaidResponse = (typeof raidResponse.enumValues)[number];

/**
 * A member anti-nuke stripped of roles (or a bot it kicked). `removedRoleIds`
 * lets the owner put the roles back if it was a false alarm.
 */
export const quarantines = pgTable(
  "quarantines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    reason: text("reason").notNull(),
    removedRoleIds: text("removed_role_ids").array().notNull().default(sql`'{}'::text[]`),
    /** True when the actor was a bot and was kicked instead. */
    kicked: boolean("kicked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    restoredById: text("restored_by_id"),
  },
  (t) => [index("quarantines_guild_user").on(t.guildId, t.userId)],
).enableRLS();

export type Quarantine = typeof quarantines.$inferSelect;

// ---------------------------------------------------------------------------
// Rally (LFG)
// ---------------------------------------------------------------------------

export const lfgStatus = pgEnum("lfg_status", ["open", "full", "closed", "expired"]);

/** A slot group on an LFG post, e.g. { name: "Tank", count: 1 }. Unnamed groups use "". */
export interface LfgSlotGroup {
  name: string;
  count: number;
}

export const lfgPosts = pgTable(
  "lfg_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    /** The card message. Set right after posting it. */
    messageId: text("message_id"),
    hostId: text("host_id").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    slots: jsonb("slots").$type<LfgSlotGroup[]>().notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: lfgStatus("status").notNull().default("open"),
    /** Voice channel Garrison created for the full squad. Garrison deletes only channels recorded here. */
    voiceChannelId: text("voice_channel_id"),
    /** The Rally template it was posted from, if any. */
    templateId: text("template_id"),
    /** The wording at posting time, so editing a template never rewrites live cards. Null: defaults. */
    wording: jsonb("wording").$type<RallyWording & { voice: boolean }>(),
    /** When Garrison notified the template's role about this post (Pro). */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("lfg_posts_guild_status").on(t.guildId, t.status),
    // One open group per host per server keeps /lfg from being a spam vector.
    uniqueIndex("lfg_posts_one_open_per_host")
      .on(t.guildId, t.hostId)
      .where(sql`${t.status} in ('open', 'full')`),
  ],
).enableRLS();

/** Who joined which post. Leaving sets `leftAt` instead of deleting, so the bot needs no DELETE. */
export const lfgMembers = pgTable(
  "lfg_members",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => lfgPosts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    slotName: text("slot_name").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
).enableRLS();

export type LfgPost = typeof lfgPosts.$inferSelect;
export type LfgMember = typeof lfgMembers.$inferSelect;
export type LfgStatus = (typeof lfgStatus.enumValues)[number];

// ---------------------------------------------------------------------------
// Ops (events and raids)
// ---------------------------------------------------------------------------

export const opsStatus = pgEnum("ops_status", ["scheduled", "cancelled", "done"]);

export const opsSettings = pgTable("ops_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  /** IANA time zone used when /raid create gets a date without one. */
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const opsEvents = pgTable(
  "ops_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Weekly repeats share a series ID. */
    seriesId: uuid("series_id").notNull().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id"),
    hostId: text("host_id").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    slots: jsonb("slots").$type<LfgSlotGroup[]>().notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    repeatWeekly: boolean("repeat_weekly").notNull().default(false),
    status: opsStatus("status").notNull().default("scheduled"),
    reminded24hAt: timestamp("reminded_24h_at", { withTimezone: true }),
    reminded30mAt: timestamp("reminded_30m_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ops_events_guild_starts").on(t.guildId, t.startsAt),
    index("ops_events_scheduled_starts").on(t.startsAt).where(sql`${t.status} = 'scheduled'`),
    // A series has at most one scheduled occurrence, so a repeat is created once.
    uniqueIndex("ops_events_one_scheduled_per_series")
      .on(t.seriesId)
      .where(sql`${t.status} = 'scheduled'`),
  ],
).enableRLS();

/** A signup. `role` is the role they want; `bench` is true while they wait for a spot. Withdrawing sets `leftAt`. */
export const opsSignups = pgTable(
  "ops_signups",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => opsEvents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    spec: text("spec"),
    bench: boolean("bench").notNull().default(false),
    signedUpAt: timestamp("signed_up_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
).enableRLS();

export type OpsEvent = typeof opsEvents.$inferSelect;
export type OpsSignup = typeof opsSignups.$inferSelect;
export type OpsSettings = typeof opsSettings.$inferSelect;

// ---------------------------------------------------------------------------
// Dashboard sessions
// ---------------------------------------------------------------------------

/**
 * Dashboard login sessions. The cookie holds a random 256-bit token; only its
 * SHA-256 hash is stored, so a database leak can't be replayed as sessions.
 * Discord OAuth tokens are never stored.
 */
export const webSessions = pgTable(
  "web_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    /** Servers the user could manage at login, for the server picker only. Access is re-checked live. */
    manageableGuildIds: text("manageable_guild_ids").array().notNull().default(sql`'{}'::text[]`),
    /** Name and icon of each of those servers, as Discord reported them at login. Display only. */
    manageableGuilds: jsonb("manageable_guilds")
      .$type<{ id: string; name: string; icon: string | null }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("web_sessions_user").on(t.userId)],
).enableRLS();

export type WebSession = typeof webSessions.$inferSelect;

// ---------------------------------------------------------------------------
// Settings history (dashboard edits)
// ---------------------------------------------------------------------------

export const settingsModule = pgEnum("settings_module", [
  "watch",
  "gatehouse",
  "ops",
  "ranks",
  "ledger",
  "escalation",
  "rally",
  "rewards",
]);

/** Field-level before/after, e.g. { dmMembers: { from: true, to: false } }. */
export type SettingsDiff = Record<string, { from: unknown; to: unknown }>;

/**
 * Append-only history of dashboard settings changes. Nobody but the database
 * owner can edit or delete a row, so it's a trustworthy record of who
 * changed what. An undo is a new row pointing at the change it reverts.
 */
export const settingsChanges = pgTable(
  "settings_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    module: settingsModule("module").notNull(),
    changes: jsonb("changes").$type<SettingsDiff>().notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    revertsChangeId: uuid("reverts_change_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("settings_changes_guild_created").on(t.guildId, t.createdAt),
    // A change can be undone once.
    uniqueIndex("settings_changes_one_revert")
      .on(t.revertsChangeId)
      .where(sql`${t.revertsChangeId} is not null`),
  ],
).enableRLS();

export type SettingsChange = typeof settingsChanges.$inferSelect;
export type SettingsModule = (typeof settingsModule.enumValues)[number];

// ---------------------------------------------------------------------------
// Ranks (leveling)
// ---------------------------------------------------------------------------

export const announceMode = pgEnum("announce_mode", ["off", "same_channel", "channel"]);

export const ranksSettings = pgTable("ranks_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  /** Off by default: counting messages is the server's choice. */
  enabled: boolean("enabled").notNull().default(false),
  announce: announceMode("announce").notNull().default("same_channel"),
  announceChannelId: text("announce_channel_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Role given at a level. A removed reward keeps its row with `roleId` null, so the bot needs no DELETE. */
export const rankRewards = pgTable(
  "rank_rewards",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    roleId: text("role_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.level] }),
    check("rank_rewards_level", sql`${t.level} BETWEEN 1 AND 500`),
  ],
).enableRLS();

export const memberXp = pgTable(
  "member_xp",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** Last seen username, so the dashboard can show names without asking Discord. */
    username: text("username").notNull().default(""),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    messages: integer("messages").notNull().default(0),
    lastXpAt: timestamp("last_xp_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    index("member_xp_guild_xp").on(t.guildId, t.xp),
  ],
).enableRLS();

export type RanksSettings = typeof ranksSettings.$inferSelect;
export type RankReward = typeof rankRewards.$inferSelect;
export type MemberXp = typeof memberXp.$inferSelect;

// ---------------------------------------------------------------------------
// Ledger (logs)
// ---------------------------------------------------------------------------

export const ledgerSettings = pgTable(
  "ledger_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    /** Channel that gets a line for each event. Null keeps events in the dashboard only. */
    channelId: text("channel_id"),
    /** Events older than this are removed by ledger_prune(). */
    retentionDays: integer("retention_days").notNull().default(30),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("ledger_retention_range", sql`${t.retentionDays} BETWEEN 7 AND 365`)],
).enableRLS();

/**
 * Server events: who did what, when. Never message content. Rows are
 * insert-only for the bot; only ledger_prune() removes them, and only once
 * they're past the server's retention.
 */
export const ledgerEvents = pgTable(
  "ledger_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    /** e.g. member_join, member_ban, role_update, message_delete, voice_join. */
    type: text("type").notNull(),
    actorId: text("actor_id"),
    targetId: text("target_id"),
    channelId: text("channel_id"),
    /** Short, human summary written by the bot, e.g. "Added @Raider". No message content. */
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_events_guild_id").on(t.guildId, t.id),
    index("ledger_events_guild_target").on(t.guildId, t.targetId, t.id),
    index("ledger_events_guild_actor").on(t.guildId, t.actorId, t.id),
    index("ledger_events_created").on(t.createdAt),
  ],
).enableRLS();

export type LedgerSettings = typeof ledgerSettings.$inferSelect;
export type LedgerEvent = typeof ledgerEvents.$inferSelect;
export type NewLedgerEvent = Omit<typeof ledgerEvents.$inferInsert, "id" | "createdAt">;

// ---------------------------------------------------------------------------
// Quartermaster (AI builder)
// ---------------------------------------------------------------------------

export const qmStatus = pgEnum("qm_status", [
  "pending",
  "applied",
  "cancelled",
  "expired",
  "failed",
  "rolled_back",
]);

/** One validated operation of a build plan. Additive only: Quartermaster never edits or deletes existing things. */
export interface QmOperation {
  kind: "create_category" | "create_text_channel" | "create_voice_channel" | "create_role";
  ref: string;
  name: string;
  /** A category ref from this plan, or an existing category ID. */
  parent: string | null;
  topic: string | null;
  slowmodeSeconds: number | null;
  userLimit: number | null;
  /** Role refs from this plan or existing role IDs. When set, the channel is hidden from everyone else. */
  privateTo: string[];
  color: number | null;
  hoist: boolean;
  mentionable: boolean;
}

/** Something a build created, recorded as it happens so Undo works even after a partial failure. */
export interface QmCreated {
  kind: "category" | "channel" | "role";
  id: string;
  name: string;
}

export const qmBuilds = pgTable(
  "qm_builds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    /** Per-server version number: "v15". */
    version: integer("version").notNull(),
    requestedById: text("requested_by_id").notNull(),
    requestedByTag: text("requested_by_tag").notNull(),
    prompt: text("prompt").notNull(),
    summary: text("summary").notNull(),
    plan: jsonb("plan").$type<QmOperation[]>().notNull(),
    model: text("model").notNull(),
    status: qmStatus("status").notNull().default("pending"),
    created: jsonb("created").$type<QmCreated[]>().notNull().default([]),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rolledBackById: text("rolled_back_by_id"),
  },
  (t) => [
    uniqueIndex("qm_builds_guild_version").on(t.guildId, t.version),
    index("qm_builds_guild_created").on(t.guildId, t.createdAt),
  ],
).enableRLS();

export type QmBuild = typeof qmBuilds.$inferSelect;
export type QmStatus = (typeof qmStatus.enumValues)[number];

// ---------------------------------------------------------------------------
// Barracks (linked game accounts)
// ---------------------------------------------------------------------------

export const linkSource = pgEnum("link_source", ["discord", "battlenet", "claimed"]);

/**
 * A game account a member linked. User-level, not per server: whether a
 * server can see it is decided by roster_shares. Never stores tokens.
 * Removing a link sets removed_at.
 */
export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    /** steam, battlenet, riotgames, xbox, playstation, epicgames, osrs, wow, ... */
    provider: text("provider").notNull(),
    /** The provider's ID, or for OSRS the lowercased name, or for WoW region:realm:name. */
    accountId: text("account_id").notNull(),
    displayName: text("display_name").notNull(),
    /** True when the provider proved ownership (Discord Connections, Battle.net sign-in). */
    verified: boolean("verified").notNull(),
    source: linkSource("source").notNull(),
    /** Game details shown in rosters, e.g. OSRS total level, WoW level and class. */
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("linked_accounts_unique").on(t.userId, t.provider, t.accountId),
    index("linked_accounts_user").on(t.userId),
  ],
).enableRLS();

/** A member's consent to show their linked accounts in one server's roster. */
export const rosterShares = pgTable(
  "roster_shares",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** Last-known username, for rosters. */
    username: text("username").notNull().default(""),
    sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.userId] }), index("roster_shares_user").on(t.userId)],
).enableRLS();

export type LinkedAccount = typeof linkedAccounts.$inferSelect;
export type RosterShare = typeof rosterShares.$inferSelect;

// ---------------------------------------------------------------------------
// Health, activity and service metrics
// ---------------------------------------------------------------------------

/** The latest /health result per server, written by the bot so the dashboard can show it. */
export const healthSnapshots = pgTable("health_snapshots", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  checks: jsonb("checks").$type<{ status: "ok" | "warn" | "fix"; text: string }[]>().notNull(),
  problems: integer("problems").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Messages per server per day. Counts only, never content. */
export const guildActivityDaily = pgTable(
  "guild_activity_daily",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    messages: integer("messages").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.day] })],
).enableRLS();

/** When each member last posted, for "active members". Updated at most every 15 minutes per member. */
export const memberLastSeen = pgTable(
  "member_last_seen",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    index("member_last_seen_guild_time").on(t.guildId, t.lastSeenAt),
  ],
).enableRLS();

/**
 * How fast commands are answered, per hour: time from the interaction's
 * creation (Discord's timestamp) to Garrison's first response. guild_id ''
 * is all servers together.
 */
export const commandLatencyHourly = pgTable(
  "command_latency_hourly",
  {
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    guildId: text("guild_id").notNull().default(""),
    count: integer("count").notNull(),
    p50Ms: integer("p50_ms").notNull(),
    p95Ms: integer("p95_ms").notNull(),
  },
  (t) => [primaryKey({ columns: [t.hour, t.guildId] })],
).enableRLS();

/** Minutes the bot was up, per day, for the status page. */
export const botUptimeDaily = pgTable("bot_uptime_daily", {
  day: date("day").primaryKey(),
  minutesUp: integer("minutes_up").notNull().default(0),
  /** When the first heartbeat of the day landed, so a partial first day is not counted as downtime. */
  firstBeatAt: timestamp("first_beat_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** One row: the bot's latest heartbeat. */
export const botStatus = pgTable("bot_status", {
  id: integer("id").primaryKey().default(1),
  lastBeatAt: timestamp("last_beat_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
}).enableRLS();

export type HealthSnapshot = typeof healthSnapshots.$inferSelect;

// ---------------------------------------------------------------------------
// Dashboard actions (an outbox the bot works through)
// ---------------------------------------------------------------------------

export const dashboardActionKind = pgEnum("dashboard_action_kind", [
  "create_raid",
  "move_signup",
  "call_signups",
  "lockdown_start",
  "lockdown_end",
  "release_quarantine",
  "undo_case",
  "cancel_raid",
  "close_lfg",
  "undo_build",
  "run_health",
  "post_verify_panel",
  "anti_nuke",
]);
export const dashboardActionStatus = pgEnum("dashboard_action_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

export interface CreateRaidPayload {
  channelId: string;
  title: string;
  /** Local date and time in the server's raid time zone: "2026-11-12 20:00". */
  when: string;
  /** "Tank 4, Healer 8, DPS 28" */
  roles: string;
  note: string | null;
  repeatWeekly: boolean;
}
export interface MoveSignupPayload {
  eventId: string;
  userId: string;
  role: string;
}
export interface CallSignupsPayload {
  eventId: string;
}
export interface LockdownStartPayload {
  /** Minutes until it lifts on its own; null waits for someone to lift it. */
  durationMinutes: number | null;
  pauseInvites: boolean;
  reason: string | null;
}
export interface IdPayload {
  id: string;
}
export interface CaseNumberPayload {
  caseNumber: number;
}
export interface BuildVersionPayload {
  version: number;
}
export interface VerifyPanelPayload {
  channelId: string;
}
/** Owner only: the bot applies it after confirming the requester owns the server. */
export interface AntiNukePayload {
  enabled: boolean;
  trustedIds: string[];
  deleteThreshold: number;
  banThreshold: number;
}

/**
 * Things the dashboard asks Garrison to do in Discord. The dashboard can only
 * add requests; the bot claims each one, checks it again (including that the
 * requester still has Manage Server), does it, and records the outcome. The
 * dashboard never talks to Discord on a user's behalf.
 */
export const dashboardActions = pgTable(
  "dashboard_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    kind: dashboardActionKind("kind").notNull(),
    payload: jsonb("payload").notNull(),
    requestedById: text("requested_by_id").notNull(),
    requestedByName: text("requested_by_name").notNull(),
    status: dashboardActionStatus("status").notNull().default("pending"),
    /** A short, Garrison-written outcome shown on the dashboard. Never raw errors. */
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("dashboard_actions_guild_created").on(t.guildId, t.createdAt),
    index("dashboard_actions_pending").on(t.createdAt).where(sql`${t.status} = 'pending'`),
  ],
).enableRLS();

export type DashboardAction = typeof dashboardActions.$inferSelect;

// ---------------------------------------------------------------------------
// Rally templates and plans
// ---------------------------------------------------------------------------

/** A server's LFG templates, edited on the dashboard as one value (with history and undo). */
export const rallySettings = pgTable(
  "rally_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    templates: jsonb("templates").$type<RallyTemplate[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "rally_templates_list",
      sql`jsonb_typeof(${t.templates}) = 'array' AND jsonb_array_length(${t.templates}) <= 25`,
    ),
  ],
).enableRLS();

export const guildPlan = pgEnum("guild_plan", ["free", "pro"]);

/**
 * Which plan a server is on. No row means free. Neither the bot nor the
 * dashboard can write here: only billing (the database owner) changes plans.
 */
export const guildPlans = pgTable("guild_plans", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  plan: guildPlan("plan").notNull().default("free"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export type RallySettings = typeof rallySettings.$inferSelect;
export type { GuildPlan };
