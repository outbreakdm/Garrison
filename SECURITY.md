# Security

Garrison holds moderation power over other people's communities. Every change follows the rules below.

## Reporting a vulnerability

Email the maintainer rather than opening a public issue. We'll confirm receipt within 72 hours.

## Principles

1. **Least privilege everywhere.** The bot's database role, its Discord permissions and CI each get only what they use.
2. **Two locks on data.** Tables are closed to Supabase's public API by grants _and_ by row-level security.
3. **History is tamper-evident.** The bot can create moderation cases and mark them undone, never edit or delete them.
4. **Check before acting.** Role hierarchy and Garrison's own permissions are verified before any Discord action, and every action is recorded.
5. **Reversible by default.** Destructive changes (lockdowns, timeouts, bans) save what they need to undo themselves.
6. **User text is data.** Anything a user typed goes through `safeText` (`apps/bot/src/lib/text.ts`) before it is shown, which escapes markdown, masked links ("[Free Nitro](evil)"), headings and mentions. Messages never ping by default (`allowedMentions: { parse: [] }`); the only exception pings an explicit list of user IDs. User text is never interpolated into SQL (Drizzle parameterises every query), and channel names built from it are reduced to plain letters and numbers.
7. **Secrets stay out of git and logs.** `.env` is ignored; the logger redacts tokens, passwords and connection strings.

## Database

| Role                    | Used by                                    | Can do                                                                                                                      |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `postgres`              | Migrations only (`DATABASE_MIGRATION_URL`) | Everything                                                                                                                  |
| `garrison_bot`          | The bot at runtime (`DATABASE_URL`)        | Exactly the grants in `0002_security.sql`. No `DELETE` anywhere. Case updates are limited to `revoked_at` / `revoked_by_id` |
| `anon`, `authenticated` | Supabase Data API                          | Nothing: no grants, and no RLS policy matches them                                                                          |

### Enabling the bot role

`garrison_bot` is created without a login so no password lives in the repo. In the Supabase SQL editor, run this once, with a long random password from your password manager:

```sql
ALTER ROLE garrison_bot WITH LOGIN PASSWORD '<generated password>';
```

Then set `DATABASE_URL` to the pooled connection string with user `garrison_bot.<project-ref>` and that password. Keep the `postgres` string only in `DATABASE_MIGRATION_URL`, and only where migrations run.

### Checklist for a new table

- [ ] `.enableRLS()` on the Drizzle table (Supabase's `ensure_rls` trigger is a backstop, not the plan).
- [ ] In the same migration: the narrowest `GRANT`s `garrison_bot` needs (column-level `UPDATE` where possible), and a `garrison_bot_access` policy.
- [ ] No grants to `anon` / `authenticated` unless the dashboard deliberately exposes it, with policies written for that.
- [ ] A test in `packages/db/src/security.test.ts` that runs the new queries as `garrison_bot`.
- [ ] Run Supabase's security advisor after applying.

### Checklist for a new command or button

- [ ] `setDefaultMemberPermissions` set to the narrowest permission, and the command is guild-only.
- [ ] Buttons re-check the clicker's permission. Never trust that only moderators can see a message.
- [ ] Check Garrison's own permissions and role position before acting, and say how to fix them.
- [ ] Record the action (case, lockdown row or log) and post it to the log channel.
- [ ] Prefer ephemeral replies for moderator-only information.
- [ ] Run every piece of user-typed text through `safeText` before showing it.
- [ ] Commands open to everyone (`guildCommand(..., null)`) need a spam limit, like Rally's one open group per person.

## Discord

- Intents: `Guilds`, `Guild Moderation`, `Guild Voice States` and `Server Members` only. Message Content is not requested until automod needs it.
- Anti-nuke trusts only the owner, Garrison itself and the owner's trusted list. Changing anti-nuke settings and restoring a quarantine are owner/trusted-only, checked in code on every command and click. At the database level `garrison_bot` can update settings; the owner check lives in the bot.
- Actions taken through Garrison are attributed to the moderator who ran them, not to Garrison, so Garrison can't be used to launder a mass ban.
- Invite permissions are listed in the README; never request Administrator.
- Reset the bot token in the Developer Portal immediately if it is ever exposed. Discord also auto-revokes tokens found in public GitHub repositories.

## CI and dependencies

- CI runs with `contents: read`, no secrets, and does not persist checkout credentials.
- `pnpm audit --prod --audit-level high` fails the build on known high or critical vulnerabilities.
- Dependabot opens weekly update PRs for npm packages and GitHub Actions.
- `pnpm` only runs install scripts for allow-listed packages (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).
