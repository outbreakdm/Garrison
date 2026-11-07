CREATE TABLE "bot_status" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_beat_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bot_uptime_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"minutes_up" integer DEFAULT 0 NOT NULL,
	"first_beat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_uptime_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "command_latency_hourly" (
	"hour" timestamp with time zone NOT NULL,
	"guild_id" text DEFAULT '' NOT NULL,
	"count" integer NOT NULL,
	"p50_ms" integer NOT NULL,
	"p95_ms" integer NOT NULL,
	CONSTRAINT "command_latency_hourly_hour_guild_id_pk" PRIMARY KEY("hour","guild_id")
);
--> statement-breakpoint
ALTER TABLE "command_latency_hourly" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guild_activity_daily" (
	"guild_id" text NOT NULL,
	"day" date NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "guild_activity_daily_guild_id_day_pk" PRIMARY KEY("guild_id","day")
);
--> statement-breakpoint
ALTER TABLE "guild_activity_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "health_snapshots" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"checks" jsonb NOT NULL,
	"problems" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_last_seen" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_last_seen_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "member_last_seen" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guild_activity_daily" ADD CONSTRAINT "guild_activity_daily_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_last_seen" ADD CONSTRAINT "member_last_seen_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_last_seen_guild_time" ON "member_last_seen" USING btree ("guild_id","last_seen_at");--> statement-breakpoint
-- Least privilege. The bot writes counts and timings; the dashboard and
-- status page only read them. Nothing here holds message content.
ALTER TABLE public.bot_status ADD CONSTRAINT bot_status_single_row CHECK (id = 1);--> statement-breakpoint
GRANT SELECT, INSERT ON public.health_snapshots, public.guild_activity_daily, public.member_last_seen, public.command_latency_hourly, public.bot_uptime_daily, public.bot_status TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (checks, problems, computed_at) ON public.health_snapshots TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (messages) ON public.guild_activity_daily TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (last_seen_at) ON public.member_last_seen TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (count, p50_ms, p95_ms) ON public.command_latency_hourly TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (minutes_up) ON public.bot_uptime_daily TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (last_beat_at, started_at) ON public.bot_status TO garrison_bot;--> statement-breakpoint
GRANT SELECT ON public.health_snapshots, public.guild_activity_daily, public.member_last_seen, public.command_latency_hourly, public.bot_uptime_daily, public.bot_status TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.health_snapshots AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.health_snapshots AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.guild_activity_daily AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.guild_activity_daily AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.member_last_seen AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.member_last_seen AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.command_latency_hourly AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.command_latency_hourly AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.bot_uptime_daily AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.bot_uptime_daily AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.bot_status AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.bot_status AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
