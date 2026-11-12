ALTER TABLE "lfg_posts" ADD COLUMN "repeat_weekly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lfg_posts" ADD COLUMN "repeated_at" timestamp with time zone;--> statement-breakpoint
-- The bot marks a weekly group as reposted (or stopped).
GRANT UPDATE (repeated_at) ON public.lfg_posts TO garrison_bot;
