CREATE TYPE "public"."settings_module" AS ENUM('watch', 'gatehouse', 'ops');--> statement-breakpoint
CREATE TABLE "settings_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"module" "settings_module" NOT NULL,
	"changes" jsonb NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"reverts_change_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings_changes" ADD CONSTRAINT "settings_changes_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settings_changes_guild_created" ON "settings_changes" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_changes_one_revert" ON "settings_changes" USING btree ("reverts_change_id") WHERE "settings_changes"."reverts_change_id" is not null;--> statement-breakpoint
-- Dashboard write path (SECURITY.md). garrison_web may change exactly the
-- fields the dashboard edits, column by column. Anti-nuke settings and the
-- trusted list are not among them. The change log is insert-only for it.
GRANT UPDATE (log_channel_id, dm_members, appeal_text, updated_at) ON public.watch_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.watch_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT UPDATE (alert_channel_id, anti_raid_enabled, raid_join_count, raid_window_seconds, raid_response, auto_unlock_minutes, flag_account_age_days, updated_at) ON public.gatehouse_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.gatehouse_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT INSERT (guild_id, timezone, updated_at) ON public.ops_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (timezone, updated_at) ON public.ops_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.ops_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.ops_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT ON public.settings_changes TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.settings_changes AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.settings_changes AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);
