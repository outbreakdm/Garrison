ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'automod';--> statement-breakpoint
CREATE TABLE "automod_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"invites" boolean DEFAULT true NOT NULL,
	"mention_limit" integer DEFAULT 5 NOT NULL,
	"spam_count" integer DEFAULT 6 NOT NULL,
	"spam_seconds" integer DEFAULT 8 NOT NULL,
	"words" text[] DEFAULT '{}'::text[] NOT NULL,
	"action" text DEFAULT 'delete' NOT NULL,
	"timeout_minutes" integer DEFAULT 10 NOT NULL,
	"exempt_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"exempt_channel_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"ai_categories" text[] DEFAULT '{harassment,hate,sexual,selfharm}'::text[] NOT NULL,
	"ai_strictness" text DEFAULT 'medium' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automod_action" CHECK ("automod_settings"."action" IN ('delete', 'warn', 'timeout')),
	CONSTRAINT "automod_strictness" CHECK ("automod_settings"."ai_strictness" IN ('low', 'medium', 'high')),
	CONSTRAINT "automod_words" CHECK (cardinality("automod_settings"."words") <= 250)
);
--> statement-breakpoint
ALTER TABLE "automod_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automod_settings" ADD CONSTRAINT "automod_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits automod (with history in
-- settings_changes); the bot only reads it.
GRANT SELECT ON public.automod_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.automod_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, enabled, invites, mention_limit, spam_count, spam_seconds, words, action, timeout_minutes, exempt_role_ids, exempt_channel_ids, ai_enabled, ai_categories, ai_strictness, updated_at) ON public.automod_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, invites, mention_limit, spam_count, spam_seconds, words, action, timeout_minutes, exempt_role_ids, exempt_channel_ids, ai_enabled, ai_categories, ai_strictness, updated_at) ON public.automod_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.automod_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.automod_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.automod_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);