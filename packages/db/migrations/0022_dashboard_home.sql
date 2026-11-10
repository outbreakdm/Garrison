ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'dashboard';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"setup_dismissed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "dashboard_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Least privilege (SECURITY.md). Only the dashboard uses these preferences:
-- it reads them, creates the row, and changes them with history in
-- settings_changes. The bot has no access.
GRANT SELECT, INSERT (guild_id, setup_dismissed, updated_at) ON public.dashboard_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (setup_dismissed, updated_at) ON public.dashboard_settings TO garrison_web;--> statement-breakpoint
DROP POLICY IF EXISTS "garrison_web_read" ON public.dashboard_settings;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.dashboard_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
DROP POLICY IF EXISTS "garrison_web_insert" ON public.dashboard_settings;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.dashboard_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
DROP POLICY IF EXISTS "garrison_web_update" ON public.dashboard_settings;--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.dashboard_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
