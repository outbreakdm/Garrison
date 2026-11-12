ALTER TABLE "member_xp" ADD COLUMN "voice_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ranks_settings" ADD COLUMN "voice_xp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ranks_settings" ADD COLUMN "boosts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- The bot counts voice minutes; the dashboard turns voice XP on and edits boosts (with history).
GRANT UPDATE (voice_minutes) ON public.member_xp TO garrison_bot;--> statement-breakpoint
GRANT INSERT (voice_xp, boosts), UPDATE (voice_xp, boosts) ON public.ranks_settings TO garrison_web;--> statement-breakpoint
-- At most 10 boosts, whatever writes them.
ALTER TABLE "ranks_settings" ADD CONSTRAINT "ranks_settings_boosts_max" CHECK (jsonb_typeof(boosts) = 'array' AND jsonb_array_length(boosts) <= 10);
