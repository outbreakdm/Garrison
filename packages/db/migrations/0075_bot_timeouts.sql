-- The bot's connections can die on the way to the pooler (2026-11-18: about every 45 minutes,
-- "unexpected EOF on client connection with an open transaction", then a statement from the
-- dead client running to the 120 s limit). Each such statement held one of the bot's five
-- connections, and any open transaction's locks, for two minutes. Every query the bot runs
-- takes milliseconds, so these limits only ever end work nobody is waiting for:
--   statement_timeout 30s: a statement from a dead connection ends in 30 s, not 120 s.
--   lock_timeout 10s: nothing waits long on a lock a stuck session holds.
--   idle_in_transaction_session_timeout 15s: a session left mid-transaction is ended, which
--     releases its locks.
-- Role defaults apply to each new session, so the pooler's server connections pick them up.
-- Safe to re-run.
ALTER ROLE garrison_bot SET statement_timeout = '30s';--> statement-breakpoint
ALTER ROLE garrison_bot SET lock_timeout = '10s';--> statement-breakpoint
ALTER ROLE garrison_bot SET idle_in_transaction_session_timeout = '15s';
