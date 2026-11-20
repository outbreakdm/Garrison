ALTER TABLE "ops_settings" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_settings" ADD CONSTRAINT "ops_settings_language" CHECK ("language" IN ('en', 'es', 'pt', 'de', 'fr'));--> statement-breakpoint
-- The dashboard picks the language (Settings, Server, with history); the bot reads it.
GRANT INSERT (language), UPDATE (language) ON public.ops_settings TO garrison_web;
