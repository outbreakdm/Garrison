-- Lineups for organized raids: a raid's groups (how many, how big), each member's group, when the
-- lineup was posted, and lineups saved to reuse. Officers place members on the dashboard; the bot
-- posts the lineup (post_lineup) and keeps a member's place when they answer again.
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_lineup';--> statement-breakpoint
CREATE TABLE "ops_lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"groups" jsonb NOT NULL,
	"places" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_lineups_name" CHECK (length("ops_lineups"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "ops_lineups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ops_events" ADD COLUMN "groups" jsonb;--> statement-breakpoint
ALTER TABLE "ops_events" ADD COLUMN "lineup_posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ops_signups" ADD COLUMN "group_no" integer;--> statement-breakpoint
ALTER TABLE "ops_lineups" ADD CONSTRAINT "ops_lineups_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_lineups_guild" ON "ops_lineups" USING btree ("guild_id");
--> statement-breakpoint
GRANT UPDATE (groups) ON public.ops_events TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.ops_events AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT UPDATE (group_no, bench) ON public.ops_signups TO garrison_web;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.ops_lineups TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.ops_lineups AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT UPDATE (groups, lineup_posted_at) ON public.ops_events TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (group_no) ON public.ops_signups TO garrison_bot;
