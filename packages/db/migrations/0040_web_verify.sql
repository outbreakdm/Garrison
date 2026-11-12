ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'web_verify';--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD COLUMN "verify_web" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The dashboard turns website verification on; the bot reads it.
GRANT UPDATE (verify_web) ON public.gatehouse_settings TO garrison_web;