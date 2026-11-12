-- A closed ticket can be reopened in a new channel: the bot may move it there.
GRANT UPDATE (channel_id) ON public.tickets TO garrison_bot;