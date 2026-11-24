-- Giveaways (Pro): one question to enter ("Your in-game name?"); each entry keeps its answer so
-- staff can hand the prize over. The bot inserts both rows with table-wide INSERT, and the
-- dashboard reads them with table-wide SELECT, so no grants change.
ALTER TABLE "giveaway_entries" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "question" text;