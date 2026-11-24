-- The AI assistant applies a plan from the bot, through the same applySettingsChange the
-- dashboard uses (docs/AI_ASSISTANT.md), so the bot must be able to write every setting a plan
-- may change. These it could only read, so plans that changed them failed when they were
-- applied: voice XP (Leveling), attendance (Raids), stream alert feeds, the economy, invite
-- labels and server stats counters. qm-grants.test.ts now checks every field. INSERT covers
-- every column: a new row names them all.
GRANT INSERT (voice_xp), UPDATE (voice_xp) ON public.ranks_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (track_attendance), UPDATE (track_attendance) ON public.ops_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, feeds, updated_at), UPDATE (feeds, updated_at) ON public.alert_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, enabled, currency, earn, shop, staff_channel_id, no_earn_channel_ids, updated_at), UPDATE (enabled, currency, shop, staff_channel_id, updated_at) ON public.economy_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, labels, updated_at), UPDATE (labels, updated_at) ON public.invite_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, enabled, counters, category_id, updated_at), UPDATE (enabled, counters, category_id, updated_at) ON public.stats_settings TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.alert_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.alert_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.economy_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.economy_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.invite_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.invite_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.stats_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.stats_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);
