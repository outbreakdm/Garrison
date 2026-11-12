ALTER TABLE "giveaways" ADD COLUMN "drawn_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- The bot records everyone drawn, so a reroll never picks someone twice.
GRANT UPDATE (drawn_ids) ON public.giveaways TO garrison_bot;