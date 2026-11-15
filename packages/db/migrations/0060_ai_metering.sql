ALTER TABLE "ai_usage" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "supplies" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "qm_messages" ADD COLUMN "supplies" integer;--> statement-breakpoint
-- Calls before metering were charged a flat 3 supplies when they answered.
UPDATE "ai_usage" SET "supplies" = 3 WHERE "ok" IS NOT FALSE;--> statement-breakpoint
-- The bot records what each call used and charges it.
GRANT UPDATE (supplies, cache_read_tokens, cache_write_tokens) ON public.ai_usage TO garrison_bot;
