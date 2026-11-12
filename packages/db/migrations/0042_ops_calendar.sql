ALTER TABLE "ops_settings" ADD COLUMN "calendar_token" text;--> statement-breakpoint
-- The dashboard makes, resets and turns off the calendar feed link; the web reads it to serve the feed.
GRANT INSERT (calendar_token) ON public.ops_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (calendar_token) ON public.ops_settings TO garrison_web;
