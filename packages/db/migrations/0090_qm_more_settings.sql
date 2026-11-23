-- The AI assistant applies a plan from the bot (docs/AI_ASSISTANT.md), through the same
-- applySettingsChange the dashboard uses, so the bot needs to write what a plan may change.
-- Until 2026-11-23 it could only read the tables behind its writes, so every plan that wrote
-- a ticket panel, a role menu or a saved message, or rewrote a saved welcome card, failed when
-- it was applied. This also covers the settings the assistant learned that day: who handles
-- tickets, roles back on rejoin, the fun channels and member pages.
-- Column-level, as in 0058: INSERT on every column a row is written with (so a module's row
-- can be made on first use), UPDATE only on what a plan changes.
GRANT INSERT (guild_id, panels, staff_role_ids, parent_id, log_channel_id, max_open, ping_staff, auto_assign, modmail, updated_at), UPDATE (panels, staff_role_ids, parent_id, log_channel_id, max_open, ping_staff, auto_assign, modmail, updated_at) ON public.ticket_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, menus, updated_at), UPDATE (menus, updated_at) ON public.role_menu_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, messages, responders, updated_at), UPDATE (messages, updated_at) ON public.message_settings TO garrison_bot;--> statement-breakpoint
GRANT UPDATE (join_card, leave_card, dm_card) ON public.welcome_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, restore_roles, restore_skip_role_ids, stickies, clearing, updated_at), UPDATE (restore_roles, restore_skip_role_ids, updated_at) ON public.utility_settings TO garrison_bot;--> statement-breakpoint
GRANT INSERT (guild_id, birthdays_enabled, birthday_channel_id, birthday_role_id, counting_enabled, counting_channel_id, updated_at), UPDATE (birthdays_enabled, birthday_channel_id, birthday_role_id, counting_enabled, counting_channel_id, updated_at) ON public.fun_settings TO garrison_bot;--> statement-breakpoint
GRANT SELECT, INSERT (guild_id, show_you, show_record, public_page, public_leaderboard, public_slug, public_about, public_invite, updated_at), UPDATE (show_you, show_record, public_page, public_leaderboard, public_about, updated_at) ON public.member_pages TO garrison_bot;--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.ticket_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.ticket_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.role_menu_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.role_menu_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.message_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.message_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.utility_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.utility_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.fun_settings AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.fun_settings AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_read" ON public.member_pages AS PERMISSIVE FOR SELECT TO garrison_bot USING (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_insert" ON public.member_pages AS PERMISSIVE FOR INSERT TO garrison_bot WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "garrison_bot_update" ON public.member_pages AS PERMISSIVE FOR UPDATE TO garrison_bot USING (true) WITH CHECK (true);
