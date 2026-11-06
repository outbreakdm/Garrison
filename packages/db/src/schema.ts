import { sql } from "drizzle-orm";
import {
  boolean,
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
export const gatehouseSettings = pgTable("gatehouse_settings", {
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
}).enableRLS();

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
