ALTER TABLE "qm_builds" ADD COLUMN "settings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- The AI builder applies the settings a plan changes from the bot (docs/AI_ASSISTANT.md,
-- phase 3), through the same applySettingsChange the dashboard uses. The bot gets column
-- UPDATE on exactly the fields the AI builder may change (QM_SETTINGS in qm-settings.ts),
-- INSERT so a module's row can be made on first use (Postgres needs INSERT on every column
-- the row is written with, defaults included), and the settings history. Ranks, Logs and
-- Moderation are already writable by the bot apart from keep_message_text.
GRANT INSERT (guild_id, enabled, channel_id, anonymous, updated_at), UPDATE (enabled, channel_id, anonymous, updated_at) ON public.suggestion_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, enabled, channel_id, emoji, threshold, self_star, ignored_channel_ids, accent, updated_at), UPDATE (enabled, channel_id, emoji, threshold, self_star, ignored_channel_ids, updated_at) ON public.starboard_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, enabled, creator_channel_ids, name_template, user_limit, category_id, updated_at), UPDATE (enabled, creator_channel_ids, name_template, user_limit, category_id, updated_at) ON public.voice_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, enabled, scam_links, invites, mention_limit, spam_count, spam_seconds, words, action, timeout_minutes, exempt_role_ids, exempt_channel_ids, ai_enabled, ai_categories, ai_strictness, updated_at), UPDATE (enabled, scam_links, invites, mention_limit, spam_count, spam_seconds, words, action, timeout_minutes, exempt_role_ids, exempt_channel_ids, updated_at) ON public.automod_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, join_enabled, join_channel_id, join_card, leave_enabled, leave_channel_id, leave_card, dm_enabled, dm_card, join_role_ids, join_image, updated_at), UPDATE (join_enabled, join_channel_id, leave_enabled, leave_channel_id, dm_enabled, join_role_ids, updated_at) ON public.welcome_settings TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (keep_message_text) ON public.ledger_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT ON public.settings_changes TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.suggestion_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.suggestion_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.starboard_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.starboard_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.voice_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.voice_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.automod_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.automod_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.welcome_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.welcome_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_access" ON public.settings_changes AS PERMISSIVE FOR ALL TO garrison_bot USING (true) WITH CHECK (true);
