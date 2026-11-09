ALTER TYPE "public"."settings_module" ADD VALUE 'rewards';--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD CONSTRAINT "gatehouse_verify_age" CHECK ("gatehouse_settings"."verify_min_account_age_days" BETWEEN 0 AND 365);--> statement-breakpoint
ALTER TABLE "gatehouse_settings" ADD CONSTRAINT "gatehouse_staff_roles" CHECK (cardinality("gatehouse_settings"."staff_role_ids") <= 10);--> statement-breakpoint
ALTER TABLE "rank_rewards" ADD CONSTRAINT "rank_rewards_level" CHECK ("rank_rewards"."level" BETWEEN 1 AND 500);--> statement-breakpoint
-- Dashboard write path (SECURITY.md): staff roles and verification for
-- Gatehouse, and level rewards. Anti-nuke stays out of garrison_web's reach.
GRANT UPDATE (staff_role_ids, verify_role_id, verify_min_account_age_days) ON public.gatehouse_settings TO garrison_web;--> statement-breakpoint
GRANT INSERT (guild_id, level, role_id, updated_at) ON public.rank_rewards TO garrison_web;--> statement-breakpoint
GRANT UPDATE (role_id, updated_at) ON public.rank_rewards TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.rank_rewards AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.rank_rewards AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);
