ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'barracks';--> statement-breakpoint
CREATE TABLE "barracks_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"stat_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barracks_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "barracks_settings" ADD CONSTRAINT "barracks_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the rules (with history in
-- settings_changes); the bot only reads them. At most 10 rules, whatever writes them.
ALTER TABLE "barracks_settings" ADD CONSTRAINT "barracks_stat_roles_max" CHECK (jsonb_typeof(stat_roles) = 'array' AND jsonb_array_length(stat_roles) <= 10);--> statement-breakpoint
GRANT SELECT ON public.barracks_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.barracks_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, stat_roles, updated_at), UPDATE (stat_roles, updated_at) ON public.barracks_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.barracks_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.barracks_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.barracks_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
