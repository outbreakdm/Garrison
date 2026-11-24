-- Members ask for their stream to be announced: a request panel (posted from the dashboard or by
-- the AI assistant) opens a short form, the request goes to staff with Approve and Decline, and
-- approving adds the stream to the server's alerts. Decided requests are deleted after 90 days.
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'post_stream_panel';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'stream_request_decide';--> statement-breakpoint
CREATE TABLE "stream_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"provider" text NOT NULL,
	"handle" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"channel_id" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_requests_status" CHECK ("stream_requests"."status" IN ('waiting', 'approved', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "stream_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "requests_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_review_channel_id" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_alert_channel_id" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_role_id" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_panel_title" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_panel_body" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_panel_channel_id" text;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "request_panel_message_id" text;--> statement-breakpoint
ALTER TABLE "stream_requests" ADD CONSTRAINT "stream_requests_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stream_requests_recent" ON "stream_requests" USING btree ("guild_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_requests_one_waiting" ON "stream_requests" USING btree ("guild_id","user_id") WHERE "stream_requests"."status" = 'waiting';--> statement-breakpoint
-- The dashboard saves the request settings and reads the requests; staff decide through the
-- bot (stream_request_decide), like every change in Discord. INSERT covers every column.
GRANT INSERT (requests_enabled, request_review_channel_id, request_alert_channel_id, request_role_id, request_panel_title, request_panel_body, request_panel_channel_id, request_panel_message_id), UPDATE (requests_enabled, request_review_channel_id, request_alert_channel_id, request_role_id, request_panel_title, request_panel_body) ON public.alert_settings TO garrison_web;--> statement-breakpoint
GRANT INSERT (requests_enabled, request_review_channel_id, request_alert_channel_id, request_role_id, request_panel_title, request_panel_body, request_panel_channel_id, request_panel_message_id), UPDATE (requests_enabled, request_review_channel_id, request_alert_channel_id, request_role_id, request_panel_title, request_panel_body, request_panel_channel_id, request_panel_message_id) ON public.alert_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (status, decided_by, decided_at, channel_id, message_id) ON public.stream_requests TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.stream_requests AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.stream_requests TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.stream_requests AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
