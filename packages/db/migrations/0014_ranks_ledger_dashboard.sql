ALTER TYPE "public"."settings_module" ADD VALUE 'ranks';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE 'ledger';--> statement-breakpoint
ALTER TABLE "ledger_settings" ADD CONSTRAINT "ledger_retention_range" CHECK ("ledger_settings"."retention_days" BETWEEN 7 AND 365);--> statement-breakpoint
-- Dashboard write path (SECURITY.md). garrison_web may change exactly the
-- fields the settings page edits, and create the row if the bot hasn't yet.
-- Level rewards, XP and the events themselves stay bot-only.
GRANT INSERT (guild_id, enabled, announce, announce_channel_id, updated_at) ON public.ranks_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, announce, announce_channel_id, updated_at) ON public.ranks_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.ranks_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.ranks_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT INSERT (guild_id, channel_id, retention_days, updated_at) ON public.ledger_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (channel_id, retention_days, updated_at) ON public.ledger_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.ledger_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.ledger_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
