ALTER TABLE "welcome_settings" ADD COLUMN "join_image" text;--> statement-breakpoint
-- The dashboard turns the welcome image on; the bot only reads it.
GRANT INSERT (join_image), UPDATE (join_image) ON public.welcome_settings TO garrison_web;--> statement-breakpoint
-- Members fill in their own rank card details on the dashboard too. The dashboard
-- writes only the signed-in member's own row (checked in the action).
GRANT INSERT (guild_id, user_id, details, updated_at), UPDATE (details, updated_at) ON public.rank_profiles TO garrison_web;--> statement-breakpoint
CREATE POLICY "garrison_web_insert" ON public.rank_profiles AS PERMISSIVE FOR INSERT TO garrison_web WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_web_update" ON public.rank_profiles AS PERMISSIVE FOR UPDATE TO garrison_web USING (true) WITH CHECK (true);