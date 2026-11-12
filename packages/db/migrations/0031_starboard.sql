ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'starboard';--> statement-breakpoint
CREATE TABLE "starboard_posts" (
	"guild_id" text NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"author_id" text NOT NULL,
	"star_message_id" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "starboard_posts_guild_id_message_id_pk" PRIMARY KEY("guild_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "starboard_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "starboard_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" text,
	"emoji" text DEFAULT '⭐' NOT NULL,
	"threshold" integer DEFAULT 3 NOT NULL,
	"self_star" boolean DEFAULT false NOT NULL,
	"ignored_channel_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"accent" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "starboard_threshold" CHECK ("starboard_settings"."threshold" BETWEEN 1 AND 50)
);
--> statement-breakpoint
ALTER TABLE "starboard_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "starboard_posts" ADD CONSTRAINT "starboard_posts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starboard_settings" ADD CONSTRAINT "starboard_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "starboard_posts_recent" ON "starboard_posts" USING btree ("guild_id","created_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the starboard settings (with
-- history in settings_changes); the bot only reads them. The bot records which
-- messages are on the board (IDs and counts, never text); the dashboard only reads.
GRANT SELECT ON public.starboard_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.starboard_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, enabled, channel_id, emoji, threshold, self_star, ignored_channel_ids, accent, updated_at) ON public.starboard_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, channel_id, emoji, threshold, self_star, ignored_channel_ids, accent, updated_at) ON public.starboard_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.starboard_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.starboard_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.starboard_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (star_message_id, stars, updated_at) ON public.starboard_posts TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.starboard_posts AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.starboard_posts AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.starboard_posts AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
-- A claim whose repost failed is released; a post that reached Discord can't be deleted.
GRANT DELETE ON public.starboard_posts TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_release" ON public.starboard_posts AS PERMISSIVE FOR DELETE TO garrison_bot USING (star_message_id IS NULL);--> statement-breakpoint
GRANT SELECT ON public.starboard_posts TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.starboard_posts AS PERMISSIVE FOR SELECT TO garrison_web USING (true);