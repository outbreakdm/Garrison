CREATE TABLE "ledger_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"target_id" text,
	"channel_id" text,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"channel_id" text,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_settings" ADD CONSTRAINT "ledger_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_events_guild_id" ON "ledger_events" USING btree ("guild_id","id");--> statement-breakpoint
CREATE INDEX "ledger_events_guild_target" ON "ledger_events" USING btree ("guild_id","target_id","id");--> statement-breakpoint
CREATE INDEX "ledger_events_guild_actor" ON "ledger_events" USING btree ("guild_id","actor_id","id");--> statement-breakpoint
CREATE INDEX "ledger_events_created" ON "ledger_events" USING btree ("created_at");--> statement-breakpoint
-- Retention without DELETE for the bot (SECURITY.md). ledger_prune() runs as
-- the owner and removes only events past each server's retention, clamped to
-- 7..365 days, so even a compromised bot that sets retention to 1 day can't
-- erase the last week. It takes no arguments to abuse.
CREATE OR REPLACE FUNCTION public.ledger_prune() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.ledger_events e
  WHERE e.created_at < now() - make_interval(days => GREATEST(7, LEAST(365, COALESCE(
    (SELECT s.retention_days FROM public.ledger_settings s WHERE s.guild_id = e.guild_id), 30))));
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ledger_prune() FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.ledger_prune() FROM anon, authenticated';
  END IF;
END
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.ledger_prune() TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.ledger_settings TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (channel_id, retention_days, updated_at) ON public.ledger_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.ledger_events TO garrison_bot;--> statement-breakpoint
GRANT USAGE ON SEQUENCE public.ledger_events_id_seq TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.ledger_settings AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.ledger_events AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
GRANT SELECT ON public.ledger_settings, public.ledger_events TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ledger_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ledger_events AS PERMISSIVE FOR SELECT TO garrison_web USING (true);
