-- AI moderation is on every plan since 2026-11-20, so the AI assistant (which applies settings
-- as the bot) and "Set up in three clicks" may turn it on. Only the switch: what it looks for
-- and how strict stay choices made on the Moderation page (Pro).
GRANT UPDATE (ai_enabled) ON public.automod_settings TO garrison_bot;
