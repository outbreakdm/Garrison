ALTER TABLE "ledger_settings" ADD COLUMN "keep_message_text" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The dashboard turns message text on or off; the bot only reads it.
GRANT INSERT (keep_message_text), UPDATE (keep_message_text) ON public.ledger_settings TO garrison_web;