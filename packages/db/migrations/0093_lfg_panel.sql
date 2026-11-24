-- The "Find a group" panel: a card with a button per LFG template (and one for anything else)
-- that opens a short form and posts the group, posted from the dashboard or by the AI
-- assistant, and posted again under each new group so it stays at the bottom.
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_lfg_panel';--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_title" text;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_body" text;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_templates" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_other" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_sticky" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_channel_id" text;--> statement-breakpoint
ALTER TABLE "rally_settings" ADD COLUMN "lfg_panel_message_id" text;--> statement-breakpoint
-- The dashboard saves the panel. INSERT covers every column: a new row names them all.
GRANT INSERT (lfg_panel_title, lfg_panel_body, lfg_panel_templates, lfg_panel_other, lfg_panel_sticky, lfg_panel_channel_id, lfg_panel_message_id), UPDATE (lfg_panel_title, lfg_panel_body, lfg_panel_templates, lfg_panel_other, lfg_panel_sticky) ON public.rally_settings TO garrison_web;--> statement-breakpoint
-- The bot records where it posted the panel, and the AI assistant writes LFG settings through
-- the same applySettingsChange: new templates and the panel's words (not which templates it
-- shows). Until now the bot could only read this table, so a plan that added templates failed
-- when it was applied.
GRANT INSERT (guild_id, templates, lfg_panel_title, lfg_panel_body, lfg_panel_templates, lfg_panel_other, lfg_panel_sticky, lfg_panel_channel_id, lfg_panel_message_id, updated_at), UPDATE (templates, lfg_panel_title, lfg_panel_body, lfg_panel_other, lfg_panel_sticky, lfg_panel_channel_id, lfg_panel_message_id, updated_at) ON public.rally_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.rally_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.rally_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);
