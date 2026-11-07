CREATE TYPE "public"."guild_plan" AS ENUM('free', 'pro');--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE 'rally';--> statement-breakpoint
CREATE TABLE "guild_plans" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"plan" "guild_plan" DEFAULT 'free' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rally_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rally_templates_list" CHECK (jsonb_typeof("rally_settings"."templates") = 'array' AND jsonb_array_length("rally_settings"."templates") <= 25)
);
--> statement-breakpoint
ALTER TABLE "rally_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lfg_posts" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "lfg_posts" ADD COLUMN "wording" jsonb;--> statement-breakpoint
ALTER TABLE "lfg_posts" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guild_plans" ADD CONSTRAINT "guild_plans_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD CONSTRAINT "rally_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits templates (with history in
-- settings_changes); the bot only reads them. No row means no templates.
-- Plans are read-only for both: only billing, as the owner, writes them.
GRANT SELECT ON public.rally_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.rally_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, templates, updated_at) ON public.rally_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (templates, updated_at) ON public.rally_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.rally_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.rally_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.rally_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.guild_plans TO garrison_bot, garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.guild_plans AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.guild_plans AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT UPDATE (notified_at) ON public.lfg_posts TO garrison_bot;
