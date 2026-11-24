-- The welcome image (Pro) can be the whole welcome message: posted on its own, with or without
-- a mention above it, and with the server's own lines around the member's name.
ALTER TABLE "welcome_settings" ADD COLUMN "join_image_alone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "join_image_ping" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "join_image_top" text;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "join_image_bottom" text;--> statement-breakpoint
-- The dashboard saves them with the image.
GRANT INSERT (join_image_alone, join_image_ping, join_image_top, join_image_bottom), UPDATE (join_image_alone, join_image_ping, join_image_top, join_image_bottom) ON public.welcome_settings TO garrison_web;--> statement-breakpoint
-- The AI assistant sets the welcome image too (a preset background, how it's posted and its
-- lines), through the same applySettingsChange: the bot writes what a plan changes.
GRANT INSERT (join_image_alone, join_image_ping, join_image_top, join_image_bottom), UPDATE (join_image, join_image_alone, join_image_ping, join_image_top, join_image_bottom) ON public.welcome_settings TO garrison_bot;
