ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_message';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'messages';--> statement-breakpoint
CREATE TABLE "message_sends" (
	"guild_id" text NOT NULL,
	"message_id" text NOT NULL,
	"occurrence" timestamp with time zone NOT NULL,
	"channel_id" text NOT NULL,
	"discord_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_sends_guild_id_message_id_occurrence_pk" PRIMARY KEY("guild_id","message_id","occurrence")
);
--> statement-breakpoint
ALTER TABLE "message_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "message_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_list" CHECK (jsonb_typeof("message_settings"."messages") = 'array' AND jsonb_array_length("message_settings"."messages") <= 50)
);
--> statement-breakpoint
ALTER TABLE "message_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_sends" ADD CONSTRAINT "message_sends_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_settings" ADD CONSTRAINT "message_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits saved messages (with history
-- in settings_changes); the bot only reads them. The bot records each send; the
-- dashboard only reads that. A send row is never deleted, so it can't post twice.
GRANT SELECT ON public.message_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.message_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, messages, updated_at) ON public.message_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (messages, updated_at) ON public.message_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.message_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.message_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.message_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (discord_message_id) ON public.message_sends TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.message_sends AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.message_sends AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.message_sends AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.message_sends TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.message_sends AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
