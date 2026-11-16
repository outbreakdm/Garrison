ALTER TYPE "public"."settings_module" ADD VALUE 'stats';--> statement-breakpoint
CREATE TABLE "stat_channels" (
	"guild_id" text NOT NULL,
	"counter_key" text NOT NULL,
	"channel_id" text NOT NULL,
	"made" boolean DEFAULT true NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"count" integer,
	"renamed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stat_channels_guild_id_counter_key_pk" PRIMARY KEY("guild_id","counter_key")
);
--> statement-breakpoint
ALTER TABLE "stat_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stats_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"counters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stats_counters_list" CHECK (jsonb_typeof("stats_settings"."counters") = 'array' AND jsonb_array_length("stats_settings"."counters") <= 10)
);
--> statement-breakpoint
ALTER TABLE "stats_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stat_channels" ADD CONSTRAINT "stat_channels_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_settings" ADD CONSTRAINT "stats_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the counters (with history in
-- settings_changes); the bot only reads them. The bot keeps the record of which channel
-- shows each counter and what it last said; the dashboard only reads it.
GRANT SELECT ON public.stats_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.stats_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, enabled, counters, category_id, updated_at) ON public.stats_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, counters, category_id, updated_at) ON public.stats_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.stats_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.stats_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.stats_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (channel_id, made, name, count, renamed_at) ON public.stat_channels TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.stat_channels AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.stat_channels AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.stat_channels AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.stat_channels AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.stat_channels TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.stat_channels AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
