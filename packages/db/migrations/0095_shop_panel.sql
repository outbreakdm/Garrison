-- The shop panel: a card listing the shop with a "Buy" dropdown, posted from the dashboard or by
-- the AI assistant and updated in place after each purchase; and one question a staff-handled
-- item can ask before it's bought, its answer kept with the purchase for staff.
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_shop_panel';--> statement-breakpoint
ALTER TABLE "economy_purchases" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "shop_panel_title" text;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "shop_panel_body" text;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "shop_panel_channel_id" text;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "shop_panel_message_id" text;--> statement-breakpoint
-- The dashboard saves the panel's words. INSERT covers every column: a new row names them all.
GRANT INSERT (shop_panel_title, shop_panel_body, shop_panel_channel_id, shop_panel_message_id), UPDATE (shop_panel_title, shop_panel_body) ON public.economy_settings TO garrison_web;--> statement-breakpoint
-- The bot records where it posted the panel, and the AI assistant writes its words.
GRANT INSERT (shop_panel_title, shop_panel_body, shop_panel_channel_id, shop_panel_message_id), UPDATE (shop_panel_title, shop_panel_body, shop_panel_channel_id, shop_panel_message_id) ON public.economy_settings TO garrison_bot;
