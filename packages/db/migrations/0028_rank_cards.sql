CREATE TABLE "rank_profiles" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_profiles_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id"),
	CONSTRAINT "rank_profiles_object" CHECK (jsonb_typeof("rank_profiles"."details") = 'object')
);
--> statement-breakpoint
ALTER TABLE "rank_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ranks_settings" ADD COLUMN "card" jsonb;--> statement-breakpoint
ALTER TABLE "rank_profiles" ADD CONSTRAINT "rank_profiles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard sets the rank card's look (with
-- history in settings_changes); the bot only reads it. Members' answers are
-- written by the bot (/rankcard) and only read by the dashboard.
GRANT INSERT (card), UPDATE (card) ON public.ranks_settings TO garrison_web;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (details, updated_at) ON public.rank_profiles TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.rank_profiles AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.rank_profiles AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.rank_profiles AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.rank_profiles TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.rank_profiles AS PERMISSIVE FOR SELECT TO garrison_web USING (true);