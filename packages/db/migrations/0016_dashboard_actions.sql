CREATE TYPE "public"."dashboard_action_kind" AS ENUM('create_raid', 'move_signup', 'call_signups');--> statement-breakpoint
CREATE TYPE "public"."dashboard_action_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "dashboard_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"kind" "dashboard_action_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"requested_by_id" text NOT NULL,
	"requested_by_name" text NOT NULL,
	"status" "dashboard_action_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dashboard_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard_actions" ADD CONSTRAINT "dashboard_actions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_actions_guild_created" ON "dashboard_actions" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "dashboard_actions_pending" ON "dashboard_actions" USING btree ("created_at") WHERE "dashboard_actions"."status" = 'pending';--> statement-breakpoint
-- Outbox (SECURITY.md). garrison_web can add a request and read them, nothing
-- else: the insert policy makes a new row pending with no outcome, so it can't
-- fake a result. garrison_bot can read and record outcomes, never add or
-- change what was asked.
GRANT SELECT ON public.dashboard_actions TO garrison_web;--> statement-breakpoint
GRANT INSERT ON public.dashboard_actions TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.dashboard_actions AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.dashboard_actions AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (status = 'pending' AND message IS NULL AND processed_at IS NULL AND created_at > now() - interval '1 minute' AND created_at < now() + interval '1 minute');--> statement-breakpoint
GRANT SELECT ON public.dashboard_actions TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (status, message, processed_at) ON public.dashboard_actions TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.dashboard_actions AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);
