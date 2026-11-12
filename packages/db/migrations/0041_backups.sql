CREATE TYPE "public"."backup_kind" AS ENUM('manual', 'weekly');--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'backup_create';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'backup_restore';--> statement-breakpoint
CREATE TABLE "server_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"kind" "backup_kind" DEFAULT 'manual' NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"data" jsonb NOT NULL,
	"role_count" integer DEFAULT 0 NOT NULL,
	"channel_count" integer DEFAULT 0 NOT NULL,
	"restored_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"restored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_backups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "backup_weekly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "server_backups" ADD CONSTRAINT "server_backups_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_backups_guild" ON "server_backups" USING btree ("guild_id","created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The bot takes, rotates and restores backups; the
-- dashboard reads the list and asks through dashboard_actions. Weekly backups are
-- turned on from the dashboard.
GRANT SELECT, INSERT, DELETE ON public.server_backups TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (restored_map, restored_at) ON public.server_backups TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_all" ON public.server_backups AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT (id, guild_id, kind, created_by_id, created_by_name, role_count, channel_count, restored_at, created_at) ON public.server_backups TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.server_backups AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT UPDATE (backup_weekly) ON public.gatehouse_settings TO garrison_web;