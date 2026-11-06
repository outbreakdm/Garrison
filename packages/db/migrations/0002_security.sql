-- Security hardening. See SECURITY.md.

-- 1. Least-privilege role for the bot. Created NOLOGIN; an operator enables
--    login with a password outside of version control (see SECURITY.md).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'garrison_bot') THEN
    CREATE ROLE garrison_bot NOLOGIN NOINHERIT;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO garrison_bot;--> statement-breakpoint

-- Grants list exactly what the bot's queries need. No table gets DELETE:
-- the bot never removes rows, and moderation history stays tamper-evident.
GRANT SELECT, INSERT ON public.guilds TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (name, left_at, case_counter) ON public.guilds TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.watch_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.gatehouse_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.escalation_rules TO garrison_bot;--> statement-breakpoint
-- Cases are append-only, except for marking one undone.
GRANT SELECT, INSERT ON public.mod_cases TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (revoked_at, revoked_by_id) ON public.mod_cases TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.lockdowns TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (snapshot, invites_paused, ended_at, ended_by_id) ON public.lockdowns TO garrison_bot;--> statement-breakpoint

-- RLS stays on for every table. These policies admit only garrison_bot; the
-- grants above decide which commands and columns it may use. anon and
-- authenticated still match no policy, so the public API sees nothing.
CREATE POLICY "garrison_bot_access" ON public.guilds AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.watch_settings AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.gatehouse_settings AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.escalation_rules AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.mod_cases AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.lockdowns AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint

-- 2. Drizzle's migration journal: RLS on, and no API role may touch it.
ALTER TABLE IF EXISTS "drizzle"."__drizzle_migrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;--> statement-breakpoint

-- 3. Supabase's rls_auto_enable() event-trigger function is SECURITY DEFINER
--    and was callable over the REST API. Event triggers don't check EXECUTE
--    when they fire, so revoking it keeps the trigger working.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;
