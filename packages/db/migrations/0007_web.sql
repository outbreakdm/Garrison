CREATE TABLE "web_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"manageable_guild_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "web_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "web_sessions_user" ON "web_sessions" USING btree ("user_id");--> statement-breakpoint

-- The dashboard's role: read-only on every module table, and the only role
-- that can touch sessions. It writes nothing else. See SECURITY.md.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'garrison_web') THEN
    CREATE ROLE garrison_web NOLOGIN NOINHERIT;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO garrison_web;--> statement-breakpoint
GRANT SELECT ON public.guilds TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.guilds AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.watch_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.watch_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.gatehouse_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.gatehouse_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.escalation_rules TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.escalation_rules AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.mod_cases TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.mod_cases AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.lockdowns TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.lockdowns AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.quarantines TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.quarantines AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.lfg_posts TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.lfg_posts AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.lfg_members TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.lfg_members AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.ops_settings TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ops_settings AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.ops_events TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ops_events AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT ON public.ops_signups TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_read" ON public.ops_signups AS PERMISSIVE FOR SELECT TO garrison_web USING (true);--> statement-breakpoint
GRANT SELECT, INSERT ON public.web_sessions TO garrison_web;--> statement-breakpoint
GRANT UPDATE (last_seen_at, revoked_at) ON public.web_sessions TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_access" ON public.web_sessions AS PERMISSIVE FOR ALL TO garrison_web USING (true) WITH CHECK (true);
