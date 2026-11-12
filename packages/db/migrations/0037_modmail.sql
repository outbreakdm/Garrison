ALTER TABLE "ticket_settings" ADD COLUMN "modmail" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "via_dm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The dashboard turns modmail on; the bot reads it and marks the tickets it opens by DM.
GRANT INSERT (modmail), UPDATE (modmail) ON public.ticket_settings TO garrison_web;