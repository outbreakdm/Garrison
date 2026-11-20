ALTER TABLE "message_settings" ADD COLUMN "responders" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "message_settings" ADD CONSTRAINT "responders_list" CHECK (jsonb_typeof("message_settings"."responders") = 'array' AND jsonb_array_length("message_settings"."responders") <= 100);--> statement-breakpoint
-- The dashboard edits auto-responders (with history in settings_changes); the bot only reads
-- them, through its SELECT on the table.
GRANT INSERT (responders), UPDATE (responders) ON public.message_settings TO garrison_web;
