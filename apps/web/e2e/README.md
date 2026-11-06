# Dashboard end-to-end checks

Runs the production build against a real Postgres and a local stand-in for Discord, signs in with a seeded session, and attacks the settings Server Actions: forged server IDs, smuggled anti-nuke fields, foreign channels, out-of-range values, cross-origin replay. It also checks Undo, the forms after Undo, live permission checks and CSP violations.

1. Start Postgres 16 on port 55432 and run `DATABASE_MIGRATION_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm db:migrate`.
2. `ALTER ROLE garrison_web WITH LOGIN PASSWORD 'test-web'; ALTER ROLE garrison_bot WITH LOGIN PASSWORD 'test-bot';`
3. As `garrison_bot`, `upsertGuild` servers `111111111111111111` and `222222222222222222`.
4. Insert a `web_sessions` row for user `1` whose `token_hash` is the SHA-256 of `$E2E_SESSION_TOKEN`.
5. `node e2e/mock-discord.cjs &` (user 1 manages the first server only).
6. `pnpm build`, then start with `DISCORD_API_BASE=http://127.0.0.1:4100 DISCORD_TOKEN=test-bot-token WEB_DATABASE_URL=postgres://garrison_web:test-web@127.0.0.1:55432/postgres APP_URL=http://localhost:3100 npx next start --port 3100`.
7. `E2E_SESSION_TOKEN=… node e2e/settings.e2e.cjs`. Exits non-zero on any failure.
