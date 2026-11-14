ALTER TABLE "automod_settings" ADD COLUMN "scam_links" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- The dashboard edits the new switch like the other Automod settings; the bot reads it.
GRANT INSERT (scam_links), UPDATE (scam_links) ON public.automod_settings TO garrison_web;
