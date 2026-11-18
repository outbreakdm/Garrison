CREATE INDEX IF NOT EXISTS "guild_plans_bundle" ON "guild_plans" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qm_builds_continues" ON "qm_builds" USING btree ("continues_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qm_messages_build" ON "qm_messages" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_notes_guild" ON "ticket_notes" USING btree ("guild_id");--> statement-breakpoint
-- Retention for operational rows that only grew (docs/SCALING.md, Stage 1). Like
-- insights_prune: runs as the owner, takes no arguments, and only removes what is past
-- keeping, so the bot may call it but can't delete anything newer. Cases, settings history,
-- AI conversations and AI usage are kept as before.
--   dashboard_actions: 30 days (nothing reads one older than an hour; the dashboard lists
--     the latest 30 per server). Never one still pending or running.
--   command_latency_hourly: 90 days (the status page shows 30).
CREATE OR REPLACE FUNCTION public.operations_prune() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE removed integer := 0; n integer;
BEGIN
  DELETE FROM public.dashboard_actions
    WHERE created_at < now() - interval '30 days' AND status NOT IN ('pending', 'running');
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  DELETE FROM public.command_latency_hourly WHERE hour < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT; removed := removed + n;
  RETURN removed;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.operations_prune() FROM PUBLIC;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.operations_prune() FROM anon, authenticated';
  END IF;
END
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.operations_prune() TO garrison_bot;
