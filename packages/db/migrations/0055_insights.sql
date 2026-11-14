CREATE TABLE "active_members_daily" (
	"guild_id" text NOT NULL,
	"day" date NOT NULL,
	"members" integer NOT NULL,
	CONSTRAINT "active_members_daily_guild_id_day_pk" PRIMARY KEY("guild_id","day")
);
--> statement-breakpoint
ALTER TABLE "active_members_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "channel_activity_daily" (
	"guild_id" text NOT NULL,
	"day" date NOT NULL,
	"channel_id" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "channel_activity_daily_guild_id_day_channel_id_pk" PRIMARY KEY("guild_id","day","channel_id")
);
--> statement-breakpoint
ALTER TABLE "channel_activity_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "guild_activity_hourly" (
	"guild_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "guild_activity_hourly_guild_id_hour_pk" PRIMARY KEY("guild_id","hour")
);
--> statement-breakpoint
ALTER TABLE "guild_activity_hourly" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_activity_daily" (
	"guild_id" text NOT NULL,
	"day" date NOT NULL,
	"user_id" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "member_activity_daily_guild_id_day_user_id_pk" PRIMARY KEY("guild_id","day","user_id")
);
--> statement-breakpoint
ALTER TABLE "member_activity_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_flow" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_code" text,
	"inviter_id" text,
	"inviter_name" text,
	CONSTRAINT "member_flow_kind" CHECK ("member_flow"."kind" IN ('join', 'leave'))
);
--> statement-breakpoint
ALTER TABLE "member_flow" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "active_members_daily" ADD CONSTRAINT "active_members_daily_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_activity_daily" ADD CONSTRAINT "channel_activity_daily_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_activity_hourly" ADD CONSTRAINT "guild_activity_hourly_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_activity_daily" ADD CONSTRAINT "member_activity_daily_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_flow" ADD CONSTRAINT "member_flow_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_flow_guild_at" ON "member_flow" USING btree ("guild_id","at");--> statement-breakpoint
CREATE INDEX "member_flow_guild_user" ON "member_flow" USING btree ("guild_id","user_id","at");--> statement-breakpoint
-- Least privilege (SECURITY.md). The bot adds counts and joins/leaves; the dashboard only
-- reads. Nothing here holds message content. Neither role can delete: insights_prune()
-- runs as the owner, takes no arguments, and only removes what is past keeping.
GRANT SELECT, INSERT ON public.channel_activity_daily, public.guild_activity_hourly, public.member_activity_daily, public.member_flow TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (messages) ON public.channel_activity_daily, public.guild_activity_hourly, public.member_activity_daily TO garrison_bot;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.member_flow_id_seq TO garrison_bot;--> statement-breakpoint
GRANT SELECT ON public.channel_activity_daily, public.guild_activity_hourly, public.member_activity_daily, public.member_flow, public.active_members_daily TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.channel_activity_daily AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.guild_activity_hourly AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.member_activity_daily AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.member_flow AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.channel_activity_daily AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.guild_activity_hourly AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.member_activity_daily AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.member_flow AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.active_members_daily AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.insights_prune() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed integer := 0; n integer;
BEGIN
  -- Fold finished days into plain counts before the per-member rows go.
  INSERT INTO public.active_members_daily (guild_id, day, members)
    SELECT guild_id, day, count(*)::int FROM public.member_activity_daily
    WHERE day < current_date GROUP BY guild_id, day
  ON CONFLICT (guild_id, day) DO UPDATE SET members = excluded.members;
  DELETE FROM public.member_activity_daily WHERE day < current_date - 35;
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM public.active_members_daily WHERE day < current_date - 400;
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM public.channel_activity_daily WHERE day < current_date - 400;
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM public.guild_activity_hourly WHERE hour < now() - interval '400 days';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM public.member_flow WHERE at < now() - interval '400 days';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  RETURN removed;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.insights_prune() FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.insights_prune() FROM anon, authenticated';
  END IF;
END
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.insights_prune() TO garrison_bot;
