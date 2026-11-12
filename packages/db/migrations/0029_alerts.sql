ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'alerts';--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"feeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_feeds_list" CHECK (jsonb_typeof("alert_settings"."feeds") = 'array' AND jsonb_array_length("alert_settings"."feeds") <= 25)
);
--> statement-breakpoint
ALTER TABLE "alert_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "alert_state" (
	"guild_id" text NOT NULL,
	"feed_id" text NOT NULL,
	"resolved_id" text,
	"last_item_id" text,
	"live_since" timestamp with time zone,
	"problem" text,
	"checked_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	CONSTRAINT "alert_state_guild_id_feed_id_pk" PRIMARY KEY("guild_id","feed_id")
);
--> statement-breakpoint
ALTER TABLE "alert_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_state" ADD CONSTRAINT "alert_state_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits feeds (with history in
-- settings_changes); the bot only reads them. The bot records what it last saw
-- and posted; the dashboard only reads that.
GRANT SELECT ON public.alert_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.alert_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, feeds, updated_at) ON public.alert_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (feeds, updated_at) ON public.alert_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.alert_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.alert_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.alert_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (resolved_id, last_item_id, live_since, problem, checked_at, posted_at) ON public.alert_state TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.alert_state AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.alert_state AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.alert_state AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.alert_state TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.alert_state AS PERMISSIVE FOR SELECT TO garrison_web USING (true);