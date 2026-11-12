CREATE TYPE "public"."ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_ticket_panel';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'ticket_action';--> statement-breakpoint
ALTER TYPE "public"."settings_module" ADD VALUE IF NOT EXISTS 'tickets';--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"kind" text DEFAULT 'message' NOT NULL,
	"discord_message_id" text,
	"author_id" text,
	"author_name" text NOT NULL,
	"staff" boolean DEFAULT false NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ticket_messages_kind" CHECK ("ticket_messages"."kind" IN ('message', 'event')),
	CONSTRAINT "ticket_messages_length" CHECK (length("ticket_messages"."content") <= 6000)
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_notes_length" CHECK (length("ticket_notes"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "ticket_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_panel_posts" (
	"guild_id" text NOT NULL,
	"panel_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_panel_posts_guild_id_panel_id_pk" PRIMARY KEY("guild_id","panel_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_panel_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"panels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"staff_role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"parent_id" text,
	"log_channel_id" text,
	"max_open" integer DEFAULT 1 NOT NULL,
	"ping_staff" boolean DEFAULT true NOT NULL,
	"auto_assign" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_panels_list" CHECK (jsonb_typeof("ticket_settings"."panels") = 'array' AND jsonb_array_length("ticket_settings"."panels") <= 10),
	CONSTRAINT "ticket_max_open" CHECK ("ticket_settings"."max_open" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "ticket_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"number" integer NOT NULL,
	"panel_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"topic_label" text NOT NULL,
	"opener_id" text NOT NULL,
	"opener_name" text NOT NULL,
	"channel_id" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"claimed_by" text,
	"claimed_name" text,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_from" text,
	"last_message_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"closed_by_name" text,
	"close_reason" text,
	"channel_gone" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "tickets_last_from" CHECK ("tickets"."last_from" IS NULL OR "tickets"."last_from" IN ('member', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_panel_posts" ADD CONSTRAINT "ticket_panel_posts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_settings" ADD CONSTRAINT "ticket_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket" ON "ticket_messages" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX "ticket_messages_guild" ON "ticket_messages" USING btree ("guild_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_messages_discord" ON "ticket_messages" USING btree ("discord_message_id");--> statement-breakpoint
CREATE INDEX "ticket_notes_ticket" ON "ticket_notes" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_guild_number" ON "tickets" USING btree ("guild_id","number");--> statement-breakpoint
CREATE INDEX "tickets_guild_status" ON "tickets" USING btree ("guild_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "tickets_channel" ON "tickets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "tickets_expires" ON "tickets" USING btree ("expires_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The dashboard edits the ticket setup (with history
-- in settings_changes) and writes staff notes; the bot only reads the setup. The bot
-- opens, updates and closes tickets and records their transcripts; the dashboard
-- only reads them. A ticket can be deleted only once its expiry has passed, and its
-- transcript and notes go with it.
GRANT SELECT ON public.ticket_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.ticket_settings AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, panels, staff_role_ids, parent_id, log_channel_id, max_open, ping_staff, auto_assign, updated_at) ON public.ticket_settings TO garrison_web;--> statement-breakpoint
GRANT UPDATE (panels, staff_role_ids, parent_id, log_channel_id, max_open, ping_staff, auto_assign, updated_at) ON public.ticket_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ticket_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.ticket_settings AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.ticket_settings AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (channel_id, message_id, posted_at) ON public.ticket_panel_posts TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.ticket_panel_posts AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.ticket_panel_posts AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.ticket_panel_posts AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.ticket_panel_posts TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ticket_panel_posts AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT ON public.tickets TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (status, claimed_by, claimed_name, last_from, last_message_at, first_response_at, message_count, closed_at, closed_by, closed_by_name, close_reason, channel_gone, expires_at) ON public.tickets TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.tickets AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.tickets AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.tickets AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT DELETE ON public.tickets TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_expire" ON public.tickets AS PERMISSIVE FOR DELETE TO garrison_bot USING (status = 'closed' AND expires_at IS NOT NULL AND expires_at < now());--> statement-breakpoint
GRANT SELECT ON public.tickets TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.tickets AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT ON public.ticket_messages TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (content, attachments, edited_at, deleted_at) ON public.ticket_messages TO garrison_bot;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.ticket_messages_id_seq TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.ticket_messages AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.ticket_messages AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.ticket_messages AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.ticket_messages TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ticket_messages AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT (id, ticket_id, guild_id, author_id, author_name, body, created_at) ON public.ticket_notes TO garrison_web;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.ticket_notes_id_seq TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ticket_notes AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.ticket_notes AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);
