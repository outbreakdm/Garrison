CREATE TYPE "public"."lockdown_source" AS ENUM('manual', 'anti_raid');--> statement-breakpoint
CREATE TYPE "public"."raid_response" AS ENUM('alert', 'lockdown');--> statement-breakpoint
CREATE TABLE "gatehouse_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"alert_channel_id" text,
	"anti_raid_enabled" boolean DEFAULT true NOT NULL,
	"raid_join_count" integer DEFAULT 10 NOT NULL,
	"raid_window_seconds" integer DEFAULT 30 NOT NULL,
	"raid_response" "raid_response" DEFAULT 'lockdown' NOT NULL,
	"auto_unlock_minutes" integer DEFAULT 15 NOT NULL,
	"flag_account_age_days" integer DEFAULT 7 NOT NULL,
	"staff_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"verify_role_id" text,
	"verify_min_account_age_days" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lockdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"source" "lockdown_source" NOT NULL,
	"reason" text,
	"started_by_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"invites_paused" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_id" text
);
--> statement-breakpoint
ALTER TABLE "lockdowns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD CONSTRAINT "gatehouse_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lockdowns" ADD CONSTRAINT "lockdowns_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lockdowns_one_active_per_guild" ON "lockdowns" USING btree ("guild_id") WHERE "lockdowns"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "lockdowns_active_ends_at" ON "lockdowns" USING btree ("ends_at") WHERE "lockdowns"."ended_at" is null;