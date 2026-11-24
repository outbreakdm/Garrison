-- Organized raids: a raid's signup style (simple, as before, or organized), the roster team it's
-- for, and each organized answer (coming, tentative, late, can't) with the character brought.
-- Members answer from Discord or the player page (raid_answer, through the bot).
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'raid_answer';--> statement-breakpoint
ALTER TABLE "ops_events" ADD COLUMN "style" text DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_events" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "ops_signups" ADD COLUMN "availability" text;--> statement-breakpoint
ALTER TABLE "ops_signups" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_team_id_roster_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."roster_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_signups" ADD CONSTRAINT "ops_signups_character_id_roster_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."roster_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_style" CHECK ("ops_events"."style" IN ('simple', 'organized'));--> statement-breakpoint
ALTER TABLE "ops_signups" ADD CONSTRAINT "ops_signups_availability" CHECK ("ops_signups"."availability" IS NULL OR "ops_signups"."availability" IN ('coming', 'tentative', 'late', 'cant'));
--> statement-breakpoint
GRANT UPDATE (availability, character_id) ON public.ops_signups TO garrison_bot;
