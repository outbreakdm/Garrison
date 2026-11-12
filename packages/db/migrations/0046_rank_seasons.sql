ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'season_start';--> statement-breakpoint
CREATE TABLE "rank_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_by_id" text,
	"ended_by_name" text,
	"standings" jsonb NOT NULL,
	"members" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD CONSTRAINT "rank_seasons_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_seasons_guild_number" ON "rank_seasons" USING btree ("guild_id","number");--> statement-breakpoint
-- Only the bot ends a season (asked through dashboard_actions); the dashboard reads them.
GRANT SELECT, INSERT ON public.rank_seasons TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.rank_seasons AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.rank_seasons TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.rank_seasons AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
