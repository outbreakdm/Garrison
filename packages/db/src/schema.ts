import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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
