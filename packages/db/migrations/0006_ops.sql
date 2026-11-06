CREATE TYPE "public"."ops_status" AS ENUM('scheduled', 'cancelled', 'done');--> statement-breakpoint
CREATE TABLE "ops_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text,
	"host_id" text NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"slots" jsonb NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"repeat_weekly" boolean DEFAULT false NOT NULL,
	"status" "ops_status" DEFAULT 'scheduled' NOT NULL,
	"reminded_24h_at" timestamp with time zone,
	"reminded_30m_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ops_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ops_signups" (
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"spec" text,
	"bench" boolean DEFAULT false NOT NULL,
	"signed_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "ops_signups_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ops_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_settings" ADD CONSTRAINT "ops_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_signups" ADD CONSTRAINT "ops_signups_event_id_ops_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."ops_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_events_guild_starts" ON "ops_events" USING btree ("guild_id","starts_at");--> statement-breakpoint
CREATE INDEX "ops_events_scheduled_starts" ON "ops_events" USING btree ("starts_at") WHERE "ops_events"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "ops_events_one_scheduled_per_series" ON "ops_events" USING btree ("series_id") WHERE "ops_events"."status" = 'scheduled';--> statement-breakpoint
-- Least privilege (SECURITY.md checklist). Events change status and record
-- their card and reminders; signups are withdrawn, never deleted.
GRANT SELECT, INSERT ON public.ops_settings TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (timezone, updated_at) ON public.ops_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.ops_events TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (message_id, status, reminded_24h_at, reminded_30m_at) ON public.ops_events TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.ops_signups TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (role, spec, bench, left_at, signed_up_at) ON public.ops_signups TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.ops_settings AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.ops_events AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.ops_signups AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);
