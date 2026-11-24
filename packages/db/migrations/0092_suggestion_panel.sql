-- Suggestions get a panel: a card with a button that opens Discord's form (the server's own
-- questions, the first one being the idea), posted from the dashboard or by the AI assistant,
-- and posted again under each new suggestion so it stays at the bottom of its channel.
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_suggestion_panel';--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "panel_title" text;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "panel_body" text;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "button_label" text;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "questions" jsonb;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "panel_sticky" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "panel_channel_id" text;--> statement-breakpoint
ALTER TABLE "suggestion_settings" ADD COLUMN "panel_message_id" text;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "answers" jsonb;--> statement-breakpoint
-- The dashboard saves the panel and its form. INSERT covers every column: a new row names
-- them all (with their defaults).
GRANT INSERT (panel_title, panel_body, button_label, questions, panel_sticky, panel_channel_id, panel_message_id), UPDATE (panel_title, panel_body, button_label, questions, panel_sticky) ON public.suggestion_settings TO garrison_web;--> statement-breakpoint
-- The bot records where it posted the panel, and the AI assistant writes the panel's words
-- (not its questions) through the same applySettingsChange.
GRANT INSERT (panel_title, panel_body, button_label, questions, panel_sticky, panel_channel_id, panel_message_id), UPDATE (panel_title, panel_body, button_label, panel_sticky, panel_channel_id, panel_message_id) ON public.suggestion_settings TO garrison_bot;
