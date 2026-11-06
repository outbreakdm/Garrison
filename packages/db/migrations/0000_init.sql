CREATE TYPE "public"."case_action" AS ENUM('warn', 'timeout', 'kick', 'ban', 'purge');--> statement-breakpoint
CREATE TYPE "public"."case_source" AS ENUM('manual', 'escalation', 'automod');--> statement-breakpoint
CREATE TYPE "public"."escalation_action" AS ENUM('timeout', 'kick', 'ban');--> statement-breakpoint
CREATE TABLE "escalation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"warn_count" integer NOT NULL,
	"window_minutes" integer NOT NULL,
	"action" "escalation_action" NOT NULL,
	"duration_seconds" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escalation_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"case_counter" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guilds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mod_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"case_number" integer NOT NULL,
	"action" "case_action" NOT NULL,
	"source" "case_source" DEFAULT 'manual' NOT NULL,
	"target_id" text,
	"target_tag" text,
	"moderator_id" text NOT NULL,
	"moderator_tag" text NOT NULL,
	"reason" text,
	"duration_seconds" integer,
	"expires_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mod_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watch_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"log_channel_id" text,
	"dm_members" boolean DEFAULT true NOT NULL,
	"appeal_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_cases" ADD CONSTRAINT "mod_cases_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_settings" ADD CONSTRAINT "watch_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_rules_guild_count" ON "escalation_rules" USING btree ("guild_id","warn_count");--> statement-breakpoint
CREATE INDEX "escalation_rules_guild" ON "escalation_rules" USING btree ("guild_id") WHERE "escalation_rules"."enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "mod_cases_guild_case_number" ON "mod_cases" USING btree ("guild_id","case_number");--> statement-breakpoint
CREATE INDEX "mod_cases_guild_target_created" ON "mod_cases" USING btree ("guild_id","target_id","created_at");