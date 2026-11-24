-- Voice rooms: Garrison posts the owner's controls in each new room's chat (Rename, Limit,
-- Lock, Hide, Remove someone, Hand over), on by default, and keeps that panel's message so it
-- can show the new owner when a room changes hands.
ALTER TABLE "voice_rooms" ADD COLUMN "panel_message_id" text;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD COLUMN "controls" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- The dashboard and the AI assistant turn the controls on or off. INSERT covers every column.
GRANT INSERT (controls), UPDATE (controls) ON public.voice_settings TO garrison_web;--> statement-breakpoint
GRANT INSERT (controls), UPDATE (controls) ON public.voice_settings TO garrison_bot;--> statement-breakpoint
-- The bot records the panel it posted in a room.
GRANT UPDATE (panel_message_id) ON public.voice_rooms TO garrison_bot;
