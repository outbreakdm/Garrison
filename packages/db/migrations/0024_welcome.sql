ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'welcome';--> statement-breakpoint
CREATE TABLE "welcome_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"join_enabled" boolean DEFAULT false NOT NULL,
	"join_channel_id" text,
	"join_card" jsonb,
	"leave_enabled" boolean DEFAULT false NOT NULL,
	"leave_channel_id" text,
	"leave_card" jsonb,
	"dm_enabled" boolean DEFAULT false NOT NULL,
	"dm_card" jsonb,
	"join_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "welcome_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD CONSTRAINT "welcome_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md): the dashboard edits welcome settings (with history
-- in settings_changes); the bot only reads them.
GRANT SELECT ON public.welcome_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.welcome_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, join_enabled, join_channel_id, join_card, leave_enabled, leave_channel_id, leave_card, dm_enabled, dm_card, join_role_ids, updated_at) ON public.welcome_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (join_enabled, join_channel_id, join_card, leave_enabled, leave_channel_id, leave_card, dm_enabled, dm_card, join_role_ids, updated_at) ON public.welcome_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.welcome_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.welcome_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.welcome_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
