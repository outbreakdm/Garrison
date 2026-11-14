ALTER TYPE "public"."settings_module" ADD VALUE 'voice';--> statement-breakpoint
CREATE TABLE "voice_rooms" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"creator_channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "voice_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"creator_channel_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"name_template" text,
	"user_limit" integer DEFAULT 0 NOT NULL,
	"category_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_user_limit" CHECK ("voice_settings"."user_limit" BETWEEN 0 AND 99)
);
--> statement-breakpoint
ALTER TABLE "voice_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voice_rooms" ADD CONSTRAINT "voice_rooms_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_settings" ADD CONSTRAINT "voice_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_rooms_guild" ON "voice_rooms" USING btree ("guild_id");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits voice room settings (with history in
-- settings_changes); the bot only reads them. The bot keeps the list of rooms it made (to
-- tidy up after a restart); the dashboard only reads it.
GRANT SELECT ON public.voice_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.voice_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, enabled, creator_channel_ids, name_template, user_limit, category_id, updated_at) ON public.voice_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (enabled, creator_channel_ids, name_template, user_limit, category_id, updated_at) ON public.voice_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.voice_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.voice_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.voice_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (owner_id) ON public.voice_rooms TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.voice_rooms AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.voice_rooms AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.voice_rooms AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_delete" ON public.voice_rooms AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.voice_rooms TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.voice_rooms AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
