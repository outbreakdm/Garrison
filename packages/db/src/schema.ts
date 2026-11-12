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
import type { AlertFeed } from "./alerts";
import type { CustomCard } from "./cards";
import type { BonusRole } from "./giveaways";
import type { SavedMessage } from "./messages";
import type { GuildPlan } from "./plans";
import type { RallyTemplate, RallyWording } from "./rally";
import type { RankCardStyle } from "./rank-cards";
import type { RoleMenu } from "./role-menus";
import type { TicketPanel } from "./tickets";

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
  /** Members with a case here can appeal on the dashboard's public appeal page. */
  appealsEnabled: boolean("appeals_enabled").notNull().default(false),
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
    /** Verify on the website (sign in with Discord, captcha when configured) instead of in Discord. */
    verifyWeb: boolean("verify_web").notNull().default(false),
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
  "roles",
  "welcome",
  "messages",
  "tickets",
  "alerts",
  "starboard",
  "automod",
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
  /** The rank card's look and detail fields (rank-cards.ts). Null: Garrison's standard card. */
  card: jsonb("card").$type<RankCardStyle>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** What a member wrote on their rank card, keyed by the server's field IDs. */
export const rankProfiles = pgTable(
  "rank_profiles",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    details: jsonb("details").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    check("rank_profiles_object", sql`jsonb_typeof(${t.details}) = 'object'`),
  ],
).enableRLS();

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
    /**
     * Keep the text of deleted and edited messages in their events (off by default).
     * The text lives in the event's data and goes with it at retention.
     */
    keepMessageText: boolean("keep_message_text").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("ledger_retention_range", sql`${t.retentionDays} BETWEEN 7 AND 365`)],
).enableRLS();

/**
 * Server events: who did what, when. Message text only when the server turns on
 * keep_message_text (deleted and edited messages, in `data`). Rows are
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
    /** Short, human summary written by the bot, e.g. "Added @Raider". Never message text. */
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
  "mod_action",
  "purge",
  "create_lfg",
  "lfg_join",
  "lfg_leave",
  "raid_signup",
  "raid_withdraw",
  "qm_plan",
  "qm_apply",
  "qm_cancel",
  "post_role_menu",
  "bot_profile",
  "post_message",
  "post_ticket_panel",
  "ticket_action",
  "start_giveaway",
  "giveaway_action",
  "test_alert",
  "web_verify",
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
/**
 * Change how Garrison looks in one server. A missing field is left as it is; null
 * puts back Garrison's own (no nickname, the global avatar, no banner or bio).
 * Images are data URIs, already resized in the browser.
 */
export interface BotProfilePayload {
  nick?: string | null;
  bio?: string | null;
  avatar?: string | null;
  banner?: string | null;
}
/** Post a saved message now. */
export interface PostMessagePayload {
  messageId: string;
  channelId: string;
}
/** Post a ticket panel, or update the message it was last posted as. */
export interface PostTicketPanelPayload {
  panelId: string;
  channelId: string;
}
/** Claim or close a ticket from the dashboard, as the member who asked. */
export interface TicketActionPayload {
  ticketId: string;
  op: "claim" | "close" | "reopen";
  reason: string | null;
}
/** Post a sample of one alert, without its ping, so a moderator sees where and how it posts. */
export interface TestAlertPayload {
  feedId: string;
}
/** Start a giveaway from the dashboard. Checked again by the bot. */
export interface StartGiveawayPayload {
  channelId: string;
  prize: string;
  description: string | null;
  winners: number;
  durationMinutes: number;
  requiredRoleId: string | null;
  minLevel: number | null;
  bonusRoles: BonusRole[];
  accent: string | null;
  repeat: boolean;
}
/** End a giveaway now, draw new winners, or cancel it. */
export interface GiveawayActionPayload {
  giveawayId: string;
  op: "end" | "reroll" | "cancel";
}
/** Post a role menu, or update the message it was last posted as. */
export interface PostRoleMenuPayload {
  menuId: string;
  channelId: string;
}
/** Warn, time out, kick or ban from the dashboard. The bot checks the moderator's own permissions. */
export interface ModActionPayload {
  action: "warn" | "timeout" | "kick" | "ban";
  userId: string;
  reason: string | null;
  /** Timeouts only. */
  durationSeconds: number | null;
  /** Bans only: how far back to delete their messages. */
  deleteMessageSeconds: number;
}
export interface PurgePayload {
  channelId: string;
  /** 1 to 100 of the channel's most recent messages. */
  amount: number;
  /** Only this member's messages, when set. */
  userId: string | null;
  reason: string | null;
}
export interface CreateLfgPayload {
  channelId: string;
  title: string;
  /** A template ID from this server, or null for a plain group. */
  templateId: string | null;
  /** "Tank 1, Healer 1, DPS 3", or null to use size or the template. */
  roles: string | null;
  size: number | null;
  /** The host's own role, when the group has roles. */
  myRole: string | null;
  /** "now", or a time from now like "10m" or "2h". */
  starts: string | null;
  note: string | null;
}
/** Join a group, in `role` when it has roles. */
export interface LfgJoinPayload {
  id: string;
  role: string;
}
/** Sign the requester up for a raid. */
export interface RaidSignupPayload {
  eventId: string;
  role: string;
  spec: string | null;
}
export interface RaidWithdrawPayload {
  eventId: string;
}
/** Ask Quartermaster for a plan. Nothing is built until the plan is applied. */
export interface QmPlanPayload {
  request: string;
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

/** Where a server's plan came from: a Stripe subscription, or given free by staff. */
export const planSource = pgEnum("plan_source", ["stripe", "comp"]);

/**
 * Which plan a server is on. No row means free. Neither the bot nor the
 * dashboard can write here: billing (the database owner) changes paid plans,
 * and staff give or remove free Pro only through plan_set_comp().
 */
export const guildPlans = pgTable("guild_plans", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  plan: guildPlan("plan").notNull().default("free"),
  source: planSource("source").notNull().default("stripe"),
  /** Staff member (Discord user ID) who gave a complimentary plan. */
  grantedBy: text("granted_by"),
  /** Why a complimentary plan was given, for the staff page. */
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/**
 * Garrison staff: the owner bypass. Discord user IDs, added only by the database
 * owner (one SQL insert, never in the repo). Staff see the staff page and can give
 * any server Pro for free. The dashboard reads it; nothing can write it.
 */
export const platformStaff = pgTable("platform_staff", {
  userId: text("user_id").primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// ---------------------------------------------------------------------------
// Role menus
// ---------------------------------------------------------------------------

/** A server's role menus, edited on the dashboard as one value (with history and undo). */
export const roleMenuSettings = pgTable(
  "role_menu_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    menus: jsonb("menus").$type<RoleMenu[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "role_menus_list",
      sql`jsonb_typeof(${t.menus}) = 'array' AND jsonb_array_length(${t.menus}) <= 25`,
    ),
  ],
).enableRLS();

/**
 * Where each menu was last posted, written by the bot. Separate from the menus
 * so undoing a settings change never loses track of a message in Discord.
 */
export const roleMenuPosts = pgTable(
  "role_menu_posts",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    menuId: text("menu_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.menuId] })],
).enableRLS();

export type RoleMenuPost = typeof roleMenuPosts.$inferSelect;

// ---------------------------------------------------------------------------
// Message builder (Dispatch)
// ---------------------------------------------------------------------------

/** A server's saved messages, edited on the dashboard as one value (with history and undo). */
export const messageSettings = pgTable(
  "message_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    messages: jsonb("messages").$type<SavedMessage[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "messages_list",
      sql`jsonb_typeof(${t.messages}) = 'array' AND jsonb_array_length(${t.messages}) <= 50`,
    ),
  ],
).enableRLS();

/**
 * Every send of a saved message, written by the bot. A scheduled send is claimed
 * (inserted) before it's posted, so the same occurrence can never go out twice.
 */
export const messageSends = pgTable(
  "message_sends",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    /** The scheduled time this send is for; the time of the request for "post now". */
    occurrence: timestamp("occurrence", { withTimezone: true }).notNull(),
    channelId: text("channel_id").notNull(),
    discordMessageId: text("discord_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.messageId, t.occurrence] })],
).enableRLS();

export type MessageSend = typeof messageSends.$inferSelect;

// ---------------------------------------------------------------------------
// Welcome (Herald)
// ---------------------------------------------------------------------------

/**
 * A server's welcome settings, one row, edited on the dashboard with history and
 * undo; the bot only reads it. Null cards use the defaults in welcome.ts.
 */
export const welcomeSettings = pgTable("welcome_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  joinEnabled: boolean("join_enabled").notNull().default(false),
  joinChannelId: text("join_channel_id"),
  joinCard: jsonb("join_card").$type<CustomCard>(),
  leaveEnabled: boolean("leave_enabled").notNull().default(false),
  leaveChannelId: text("leave_channel_id"),
  leaveCard: jsonb("leave_card").$type<CustomCard>(),
  dmEnabled: boolean("dm_enabled").notNull().default(false),
  dmCard: jsonb("dm_card").$type<CustomCard>(),
  joinRoleIds: text("join_role_ids").array().notNull().default(sql`'{}'::text[]`),
  /** Pro: a drawn welcome image on the welcome card. A rank-card background key or a Discord image link; null is off. */
  joinImage: text("join_image"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
export type RallySettings = typeof rallySettings.$inferSelect;
export type { GuildPlan };

// ---------------------------------------------------------------------------
// Tickets (Parley)
// ---------------------------------------------------------------------------

/** A server's ticket setup, one row, edited on the dashboard with history and undo. */
export const ticketSettings = pgTable(
  "ticket_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    panels: jsonb("panels").$type<TicketPanel[]>().notNull().default(sql`'[]'::jsonb`),
    staffRoleIds: text("staff_role_ids").array().notNull().default(sql`'{}'::text[]`),
    parentId: text("parent_id"),
    logChannelId: text("log_channel_id"),
    maxOpen: integer("max_open").notNull().default(1),
    pingStaff: boolean("ping_staff").notNull().default(true),
    autoAssign: boolean("auto_assign").notNull().default(false),
    /** Members can open a ticket by DMing Garrison (modmail). */
    modmail: boolean("modmail").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "ticket_panels_list",
      sql`jsonb_typeof(${t.panels}) = 'array' AND jsonb_array_length(${t.panels}) <= 10`,
    ),
    check("ticket_max_open", sql`${t.maxOpen} BETWEEN 1 AND 5`),
  ],
).enableRLS();

/** Where each panel was last posted, written by the bot. */
export const ticketPanelPosts = pgTable(
  "ticket_panel_posts",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    panelId: text("panel_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.panelId] })],
).enableRLS();

export const ticketStatus = pgEnum("ticket_status", ["open", "closed"]);

/** One answer from the form a member filled before the ticket opened. */
export interface TicketAnswer {
  question: string;
  answer: string;
}

/**
 * A ticket, opened by the bot when a member presses a panel button. Numbers are
 * per server and never reused. A closed ticket, transcript and all, is removed
 * once `expires_at` passes; the plan at closing sets it, so a later downgrade
 * never shortens what was promised.
 */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    panelId: text("panel_id").notNull(),
    topicId: text("topic_id").notNull(),
    topicLabel: text("topic_label").notNull(),
    openerId: text("opener_id").notNull(),
    openerName: text("opener_name").notNull(),
    channelId: text("channel_id").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    claimedBy: text("claimed_by"),
    claimedName: text("claimed_name"),
    answers: jsonb("answers").$type<TicketAnswer[]>().notNull().default(sql`'[]'::jsonb`),
    /** Who wrote last: 'member' (the opener or someone added) or 'staff'. */
    lastFrom: text("last_from"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    messageCount: integer("message_count").notNull().default(0),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
    closedByName: text("closed_by_name"),
    closeReason: text("close_reason"),
    /** Opened by DMing Garrison: the member isn't in the channel, messages are relayed. */
    viaDm: boolean("via_dm").notNull().default(false),
    /** The Discord channel was deleted after closing. */
    channelGone: boolean("channel_gone").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tickets_guild_number").on(t.guildId, t.number),
    index("tickets_guild_status").on(t.guildId, t.status, t.lastMessageAt),
    index("tickets_channel").on(t.channelId),
    index("tickets_expires").on(t.expiresAt),
    check("tickets_last_from", sql`${t.lastFrom} IS NULL OR ${t.lastFrom} IN ('member', 'staff')`),
  ],
).enableRLS();

export interface TicketAttachment {
  name: string;
  url: string;
}

/**
 * A ticket's transcript: what was written in its channel, plus Garrison's own
 * lines (opened, claimed, closed) with kind 'event'. Removed with the ticket.
 */
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("message"),
    discordMessageId: text("discord_message_id"),
    authorId: text("author_id"),
    authorName: text("author_name").notNull(),
    staff: boolean("staff").notNull().default(false),
    content: text("content").notNull().default(""),
    attachments: jsonb("attachments")
      .$type<TicketAttachment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("ticket_messages_ticket").on(t.ticketId, t.id),
    index("ticket_messages_guild").on(t.guildId, t.id),
    uniqueIndex("ticket_messages_discord").on(t.discordMessageId),
    check("ticket_messages_kind", sql`${t.kind} IN ('message', 'event')`),
    check("ticket_messages_length", sql`length(${t.content}) <= 6000`),
  ],
).enableRLS();

/** Staff notes on a ticket, written on the dashboard. The member never sees them. */
export const ticketNotes = pgTable(
  "ticket_notes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ticket_notes_ticket").on(t.ticketId, t.id),
    check("ticket_notes_length", sql`length(${t.body}) BETWEEN 1 AND 2000`),
  ],
).enableRLS();

export type TicketSettingsRow = typeof ticketSettings.$inferSelect;
export type TicketPanelPost = typeof ticketPanelPosts.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type TicketNote = typeof ticketNotes.$inferSelect;

// ---------------------------------------------------------------------------
// Stream and video alerts (Beacon)
// ---------------------------------------------------------------------------

/** A server's alert feeds, edited on the dashboard as one value (with history and undo). */
export const alertSettings = pgTable(
  "alert_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    feeds: jsonb("feeds").$type<AlertFeed[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "alert_feeds_list",
      sql`jsonb_typeof(${t.feeds}) = 'array' AND jsonb_array_length(${t.feeds}) <= 25`,
    ),
  ],
).enableRLS();

/**
 * What the bot last saw for each feed, written by the bot. The last item is
 * swapped in with a conditional update before posting, so it's posted once.
 */
export const alertState = pgTable(
  "alert_state",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    feedId: text("feed_id").notNull(),
    /** A YouTube @handle resolved to its channel ID. */
    resolvedId: text("resolved_id"),
    /** The Twitch stream ID or YouTube video ID last posted (or first seen). */
    lastItemId: text("last_item_id"),
    liveSince: timestamp("live_since", { withTimezone: true }),
    /** Why the feed isn't working, in a word: not_found, not_configured. */
    problem: text("problem"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.feedId] })],
).enableRLS();

export type AlertStateRow = typeof alertState.$inferSelect;

// ---------------------------------------------------------------------------
// Giveaways (Spoils)
// ---------------------------------------------------------------------------

export const giveawayStatus = pgEnum("giveaway_status", ["running", "ended", "cancelled"]);

/** A giveaway, started from the dashboard and run by the bot. */
export const giveaways = pgTable(
  "giveaways",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    /** The card in Discord. Null until it's posted. */
    messageId: text("message_id"),
    prize: text("prize").notNull(),
    description: text("description"),
    winners: integer("winners").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: giveawayStatus("status").notNull().default("running"),
    hostId: text("host_id").notNull(),
    hostName: text("host_name").notNull(),
    requiredRoleId: text("required_role_id"),
    minLevel: integer("min_level"),
    bonusRoles: jsonb("bonus_roles").$type<BonusRole[]>().notNull().default(sql`'[]'::jsonb`),
    accent: text("accent"),
    winnerIds: text("winner_ids").array().notNull().default(sql`'{}'::text[]`),
    /** Everyone drawn so far, across rerolls, so "Draw again" never picks someone twice. */
    drawnIds: text("drawn_ids").array().notNull().default(sql`'{}'::text[]`),
    /** Start the same giveaway again as soon as this one is drawn (Pro). */
    repeat: boolean("repeat").notNull().default(false),
    /** Entries as last shown on the card, so it's edited only when the count changes. */
    shownEntries: integer("shown_entries").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("giveaways_guild").on(t.guildId, t.createdAt),
    index("giveaways_due").on(t.status, t.endsAt),
    check("giveaways_winners", sql`${t.winners} BETWEEN 1 AND 20`),
  ],
).enableRLS();

/** Who entered, and with how many entries (bonus roles add more). */
export const giveawayEntries = pgTable(
  "giveaway_entries",
  {
    giveawayId: uuid("giveaway_id")
      .notNull()
      .references(() => giveaways.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    weight: integer("weight").notNull().default(1),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.giveawayId, t.userId] }),
    check("giveaway_entries_weight", sql`${t.weight} BETWEEN 1 AND 31`),
  ],
).enableRLS();

export type Giveaway = typeof giveaways.$inferSelect;

// ---------------------------------------------------------------------------
// Starboard (Honors)
// ---------------------------------------------------------------------------

/** A server's starboard settings, one row, edited on the dashboard with history and undo. */
export const starboardSettings = pgTable(
  "starboard_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    channelId: text("channel_id"),
    emoji: text("emoji").notNull().default("⭐"),
    threshold: integer("threshold").notNull().default(3),
    selfStar: boolean("self_star").notNull().default(false),
    ignoredChannelIds: text("ignored_channel_ids").array().notNull().default(sql`'{}'::text[]`),
    accent: text("accent"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("starboard_threshold", sql`${t.threshold} BETWEEN 1 AND 50`)],
).enableRLS();

/**
 * A message on the starboard: IDs and the star count only, never its text. The
 * row is claimed before the repost, so a message is posted to the board once.
 */
export const starboardPosts = pgTable(
  "starboard_posts",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    channelId: text("channel_id").notNull(),
    authorId: text("author_id").notNull(),
    /** The repost on the board. Null while it's being posted. */
    starMessageId: text("star_message_id"),
    stars: integer("stars").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.messageId] }),
    index("starboard_posts_recent").on(t.guildId, t.createdAt),
  ],
).enableRLS();

export type StarboardPost = typeof starboardPosts.$inferSelect;

// ---------------------------------------------------------------------------
// Watch: notes and appeals
// ---------------------------------------------------------------------------

/** Staff notes on a member. Members never see them. Removed notes are kept, marked removed. */
export const memberNotes = pgTable(
  "member_notes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    authorId: text("author_id").notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: text("removed_by"),
  },
  (t) => [
    index("member_notes_guild_user").on(t.guildId, t.userId, t.id),
    check("member_notes_length", sql`length(${t.body}) BETWEEN 1 AND 1000`),
  ],
).enableRLS();

export const appealStatus = pgEnum("appeal_status", ["open", "accepted", "denied"]);

/** An appeal from someone with a case in the server, written on the public appeal page. */
export const appeals = pgTable(
  "appeals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    caseNumber: integer("case_number"),
    body: text("body").notNull(),
    status: appealStatus("status").notNull().default("open"),
    /** What the staff told them, shown on the appeal page. */
    response: text("response"),
    reviewerId: text("reviewer_id"),
    reviewerName: text("reviewer_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("appeals_guild_status").on(t.guildId, t.status, t.createdAt),
    index("appeals_user").on(t.userId, t.guildId),
    check("appeals_body", sql`length(${t.body}) BETWEEN 20 AND 2000`),
    check("appeals_response", sql`${t.response} IS NULL OR length(${t.response}) <= 1000`),
  ],
).enableRLS();

export type MemberNote = typeof memberNotes.$inferSelect;
export type Appeal = typeof appeals.$inferSelect;

// ---------------------------------------------------------------------------
// Automod
// ---------------------------------------------------------------------------

/** A server's automod rules, one row, edited on the dashboard with history and undo. */
export const automodSettings = pgTable(
  "automod_settings",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    invites: boolean("invites").notNull().default(true),
    mentionLimit: integer("mention_limit").notNull().default(5),
    spamCount: integer("spam_count").notNull().default(6),
    spamSeconds: integer("spam_seconds").notNull().default(8),
    words: text("words").array().notNull().default(sql`'{}'::text[]`),
    action: text("action").notNull().default("delete"),
    timeoutMinutes: integer("timeout_minutes").notNull().default(10),
    exemptRoleIds: text("exempt_role_ids").array().notNull().default(sql`'{}'::text[]`),
    exemptChannelIds: text("exempt_channel_ids").array().notNull().default(sql`'{}'::text[]`),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    aiCategories: text("ai_categories")
      .array()
      .notNull()
      .default(sql`'{harassment,hate,sexual,selfharm}'::text[]`),
    aiStrictness: text("ai_strictness").notNull().default("medium"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("automod_action", sql`${t.action} IN ('delete', 'warn', 'timeout')`),
    check("automod_strictness", sql`${t.aiStrictness} IN ('low', 'medium', 'high')`),
    check("automod_words", sql`cardinality(${t.words}) <= 250`),
  ],
).enableRLS();
