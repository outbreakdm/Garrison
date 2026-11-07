ALTER TYPE "public"."settings_module" ADD VALUE 'escalation';--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_warn_count" CHECK ("escalation_rules"."warn_count" BETWEEN 1 AND 50);--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_window" CHECK ("escalation_rules"."window_minutes" BETWEEN 1 AND 525600);--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_duration" CHECK ("escalation_rules"."duration_seconds" IS NULL OR "escalation_rules"."duration_seconds" BETWEEN 1 AND 2419200);--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_timeout_needs_duration" CHECK ("escalation_rules"."action" <> 'timeout' OR "escalation_rules"."duration_seconds" IS NOT NULL);--> statement-breakpoint
-- Dashboard write path for the escalation ladder (SECURITY.md). garrison_web
-- can add steps and change or switch them off, never delete them; the checks
-- above bound every value, whoever writes it.
GRANT INSERT (id, guild_id, warn_count, window_minutes, action, duration_seconds, enabled, created_at) ON public.escalation_rules TO garrison_web;--> statement-breakpoint
GRANT UPDATE (window_minutes, action, duration_seconds, enabled) ON public.escalation_rules TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.escalation_rules AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.escalation_rules AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
