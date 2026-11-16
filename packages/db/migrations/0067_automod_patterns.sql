CREATE TABLE "automod_rules" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"rule_id" text,
	"sent" text NOT NULL,
	"error" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automod_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automod_settings" ADD COLUMN "regex_patterns" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "automod_settings" ADD COLUMN "regex_allow" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "automod_rules" ADD CONSTRAINT "automod_rules_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automod_settings" ADD CONSTRAINT "automod_patterns" CHECK (cardinality("automod_settings"."regex_patterns") <= 10);--> statement-breakpoint
ALTER TABLE "automod_settings" ADD CONSTRAINT "automod_regex_allow" CHECK (cardinality("automod_settings"."regex_allow") <= 100);--> statement-breakpoint
-- Least privilege (SECURITY.md). Patterns are automod settings the dashboard edits (history
-- in settings_changes); the bot reads them (its SELECT on automod_settings covers the new
-- columns). The AI assistant never edits patterns: the bot may only insert the row with its
-- defaults (the assistant creates it on first use), never update them. The record of the
-- Discord rule is the bot's own; the dashboard only reads it.
GRANT INSERT (regex_patterns, regex_allow), UPDATE (regex_patterns, regex_allow) ON public.automod_settings TO garrison_web;--> statement-breakpoint
GRANT INSERT (regex_patterns, regex_allow) ON public.automod_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (rule_id, sent, error, synced_at) ON public.automod_rules TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.automod_rules AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.automod_rules AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.automod_rules AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.automod_rules AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.automod_rules TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.automod_rules AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
