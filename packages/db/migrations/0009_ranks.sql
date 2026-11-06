CREATE TYPE "public"."announce_mode" AS ENUM('off', 'same_channel', 'channel');--> statement-breakpoint
CREATE TABLE "member_xp" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"last_xp_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_xp_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "member_xp" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rank_rewards" (
	"guild_id" text NOT NULL,
	"level" integer NOT NULL,
	"role_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_rewards_guild_id_level_pk" PRIMARY KEY("guild_id","level")
);
--> statement-breakpoint
ALTER TABLE "rank_rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ranks_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"announce" "announce_mode" DEFAULT 'same_channel' NOT NULL,
	"announce_channel_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ranks_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_xp" ADD CONSTRAINT "member_xp_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_rewards" ADD CONSTRAINT "rank_rewards_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranks_settings" ADD CONSTRAINT "ranks_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_xp_guild_xp" ON "member_xp" USING btree ("guild_id","xp");--> statement-breakpoint
-- Least privilege (SECURITY.md checklist). XP only goes up through awardXp;
-- the bot can't delete members' history or reward rows.
GRANT SELECT, INSERT ON public.ranks_settings TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (enabled, announce, announce_channel_id, updated_at) ON public.ranks_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.rank_rewards TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (role_id, updated_at) ON public.rank_rewards TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.member_xp TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (username, xp, level, messages, last_xp_at) ON public.member_xp TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.ranks_settings AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.rank_rewards AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.member_xp AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
-- The dashboard reads them.
GRANT SELECT ON public.ranks_settings, public.rank_rewards, public.member_xp TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ranks_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.rank_rewards AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.member_xp AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
