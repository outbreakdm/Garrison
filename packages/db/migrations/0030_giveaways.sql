CREATE TYPE "public"."giveaway_status" AS ENUM('running', 'ended', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'start_giveaway';--> statement-breakpoint
ALTER TYPE "public"."dashboard_action_kind" ADD VALUE IF NOT EXISTS 'giveaway_action';--> statement-breakpoint
CREATE TABLE "giveaway_entries" (
	"giveaway_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giveaway_entries_giveaway_id_user_id_pk" PRIMARY KEY("giveaway_id","user_id"),
	CONSTRAINT "giveaway_entries_weight" CHECK ("giveaway_entries"."weight" BETWEEN 1 AND 31)
);
--> statement-breakpoint
ALTER TABLE "giveaway_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"prize" text NOT NULL,
	"description" text,
	"winners" integer NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "giveaway_status" DEFAULT 'running' NOT NULL,
	"host_id" text NOT NULL,
	"host_name" text NOT NULL,
	"required_role_id" text,
	"min_level" integer,
	"bonus_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accent" text,
	"winner_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"shown_entries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "giveaways_winners" CHECK ("giveaways"."winners" BETWEEN 1 AND 20)
);
--> statement-breakpoint
ALTER TABLE "giveaways" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveaway_id_giveaways_id_fk" FOREIGN KEY ("giveaway_id") REFERENCES "public"."giveaways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "giveaways_guild" ON "giveaways" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "giveaways_due" ON "giveaways" USING btree ("status","ends_at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The bot creates and runs giveaways (the dashboard
-- asks through dashboard_actions) and records entries; the dashboard only reads.
GRANT SELECT, INSERT ON public.giveaways TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (message_id, status, winner_ids, shown_entries, ended_at) ON public.giveaways TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.giveaways AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.giveaways AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.giveaways AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.giveaways TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.giveaways AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.giveaway_entries TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.giveaway_entries AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.giveaway_entries AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_leave" ON public.giveaway_entries AS PERMISSIVE FOR DELETE TO garrison_bot USING (true);--> statement-breakpoint
GRANT SELECT ON public.giveaway_entries TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.giveaway_entries AS PERMISSIVE FOR SELECT TO garrison_web USING (true);