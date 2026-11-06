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

| Role                    | Used by                                    | Can do                                                                                                                                    |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`              | Migrations only (`DATABASE_MIGRATION_URL`) | Everything                                                                                                                                |
| `garrison_bot`          | The bot at runtime (`DATABASE_URL`)        | Exactly the grants in `0002_security.sql`. No `DELETE` anywhere. Case updates are limited to `revoked_at` / `revoked_by_id`               |
| `garrison_web`          | The dashboard (`WEB_DATABASE_URL`)         | `SELECT` on module tables, nothing else. Creates sessions and can only mark them seen or revoked. Can't write a single row of module data |
| `anon`, `authenticated` | Supabase Data API                          | Nothing: no grants, and no RLS policy matches them                                                                                        |

### Enabling the bot and dashboard roles

`garrison_bot` is created without a login so no password lives in the repo. In the Supabase SQL editor, run this once, with a long random password from your password manager:

```sql
ALTER ROLE garrison_bot WITH LOGIN PASSWORD '<generated password>';
ALTER ROLE garrison_web WITH LOGIN PASSWORD '<a different generated password>';
```

Use `garrison_web.<project-ref>` in `WEB_DATABASE_URL`.

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

## Dashboard

- **Sign-in:** Discord OAuth2 authorization code flow with PKCE (S256) and a random `state` compared in constant time. Scopes are `identify guilds` only.
- **No Discord tokens kept.** The access token is used for two reads at login and then revoked at Discord.
- **Sessions:** a 256-bit random token in a `__Host-` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). Only its SHA-256 is stored, so a database leak can't be replayed. Sessions last 7 days and are revoked server-side on sign-out.
- **Authorization on every request.** Each server page calls `requireGuildAccess`, which checks the session, the server ID's shape, that Garrison is in the server, and the user's **live** Manage Server permission via the bot token (cached 30 s, fails closed). Failures are 404s, so the dashboard never confirms which servers exist. Auth is never left to the proxy or a layout alone.
- **CSRF:** sign-out is POST-only and checks `Origin`. Settings use Server Actions, which are POST-only and which Next.js rejects when `Origin` doesn't match `Host`. Cookies are `SameSite=Lax`.
- **Server Actions are public endpoints.** Each one calls `checkGuildAccess` for the server named in the form, because that value comes from the browser; a page-level check doesn't cover them. Only expected form keys are read (`pick`), values are validated with the slash-command ranges, and channel IDs must be text channels the bot sees in that server.
- **Settings history:** every dashboard change is recorded field by field (before, after, who) in an append-only table. Undo writes a new row and only applies if nothing changed since. Anti-nuke and the trusted list can't be changed from the dashboard at all: they're absent from the code whitelist _and_ from the database grants.
- **End-to-end checks** in `apps/web/e2e` attack these paths against a real Postgres: forged server IDs, smuggled fields, foreign channels, out-of-range values and cross-origin replay.
- **Open redirects:** `?next=` accepts only same-site paths.
- **Headers:** a per-request nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`, `frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, COOP, a locked-down Permissions-Policy, and no `X-Powered-By`. Fonts are self-hosted, so nothing loads from third parties.
- Secret-holding modules import `server-only`, so they can't reach the browser bundle. User text is rendered by React, which escapes it.

## Discord

- Intents: `Guilds`, `Guild Moderation`, `Guild Voice States`, `Guild Messages` and `Server Members` only. Message Content is not requested: Ranks counts messages by author and time only.
- Ledger stores who did what and when, never message content. Partials are enabled only so leave and delete events arrive for uncached members and messages.
- Level rewards can never carry moderation or admin permissions. The check runs when a reward is set and again at every grant.
- Anti-nuke trusts only the owner, Garrison itself and the owner's trusted list. Changing anti-nuke settings and restoring a quarantine are owner/trusted-only, checked in code on every command and click. At the database level `garrison_bot` can update settings; the owner check lives in the bot.
- Actions taken through Garrison are attributed to the moderator who ran them, not to Garrison, so Garrison can't be used to launder a mass ban.
- Invite permissions are listed in the README; never request Administrator.
- Reset the bot token in the Developer Portal immediately if it is ever exposed. Discord also auto-revokes tokens found in public GitHub repositories.

## CI and dependencies

- CI runs with `contents: read`, no secrets, and does not persist checkout credentials.
- `pnpm audit --prod --audit-level high` fails the build on known high or critical vulnerabilities.
- Dependabot opens weekly update PRs for npm packages and GitHub Actions.
- `pnpm` only runs install scripts for allow-listed packages (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).
