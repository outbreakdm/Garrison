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
- **Settings history:** every dashboard change is recorded field by field (before, after, who) in an append-only table. Undo writes a new row and only applies if nothing changed since. Anti-nuke and the trusted list can't be changed from the dashboard at all: they're absent from the code whitelist _and_ from the database grants. The same holds for XP, level rewards and Ledger events. The escalation ladder is saved as one value with its own history and undo; the dashboard can add steps and switch them off but never delete a rule, the form only accepts the windows and timeout lengths it offers, and database checks bound every rule (timeouts at most 28 days, as Discord allows). Ledger retention is held to 7..365 days by a database check, so neither the dashboard nor a compromised bot can shorten it to wipe recent history (`ledger_prune()` clamps to the same range as well).
- **End-to-end checks** in `apps/web/e2e` attack these paths against a real Postgres: forged server IDs, smuggled fields, foreign channels, out-of-range values and cross-origin replay.
- **Search** is scoped to the server in the URL after the same access check as every page, uses parameterised queries, escapes `%`, `_` and `\` before `ILIKE`, and cuts queries at 64 characters. It's a GET form, so it needs no script beyond the ⌘K shortcut.
- **Dashboard actions go through an outbox.** Rally requests (create a raid, move a benched player, call for signups) are rows in `dashboard_actions`; only the bot acts in Discord. `garrison_web` can insert and read, and its insert policy forces a new row to be pending with no outcome. `garrison_bot` can read and record outcomes, never add or change a request. The bot parses each payload again, re-checks that the requester still has Manage Server, that every channel and raid belongs to that server, and that the requester can post in the channel. Each request runs at most once (claimed with `FOR UPDATE SKIP LOCKED`), is dropped after 10 minutes rather than done late, and its outcome is a message Garrison writes, never a raw error. Limits: 10 waiting per server, 5 a minute per member, one call for signups per raid per hour, and calls never ping.
- **Rally templates are plain text.** One checker (`checkTemplates`, shared by the bot and dashboard) refuses mentions, links, markdown and `@ < > #` in wording, bounds every field, and caps the list (3 free, 25 Pro; a database check also caps it at 25). The bot re-checks stored templates before using them and escapes wording again when it sends it. Template channels and notify roles must belong to the server. Role notifications mention only that role (`allowedMentions.roles`), at most once per template every 15 minutes, and only if the role is mentionable or Garrison has Mention Everyone. Dashboard errors come back in a 20-second httpOnly cookie, never in the URL.
- **Plans** live in `guild_plans`, which the bot and dashboard can read but not write; no row means free. The plan is applied when templates are used, not only when they're saved.
- **Open redirects:** `?next=` accepts only same-site paths.
- **Headers:** a per-request nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`, `frame-ancestors 'none'`), HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, COOP, a locked-down Permissions-Policy, and no `X-Powered-By`. Fonts are self-hosted, so nothing loads from third parties.
- Secret-holding modules import `server-only`, so they can't reach the browser bundle. User text is rendered by React, which escapes it.

## Barracks (linked accounts)

- **Consent per server:** a member's links appear in a server's roster only after they share with it, and they can stop at any time. The dashboard cannot share on a member's behalf (no `INSERT` on `roster_shares` for `garrison_web`).
- **Least data:** Discord Connections are imported only from a separate sign-in that asks for `identify connections`, and only verified, non-revoked game accounts are kept. Battle.net imports character name, realm, level, class and faction. Tokens are used once and never stored.
- **Honest labels:** links proven by Discord or Battle.net are "verified"; OSRS links are "claimed".
- Members can only remove their own links: every dashboard action is scoped to the signed-in user's ID, and the end-to-end check tries to remove someone else's.
- External APIs are called politely: OSRS hiscores at most one request every 1.5 s, refreshed in small batches.

## Quartermaster (AI)

- **The model proposes; Garrison decides.** Claude returns a structured plan (`output_config.format` with a Zod schema), and `validatePlan` then enforces every rule itself: known kinds only, refs that point backwards, existing IDs that really exist, cleaned names, numeric limits, Discord's channel and role caps. One problem rejects the whole plan.
- **Capabilities are fixed in code, not the prompt:** create category, text channel, voice channel, role. No edits, deletes, moves or messages. Roles are created with `permissions: []`; channel access comes only from an allowlist (view, send, read history, connect, speak).
- **Prompt injection:** server names reach the model inside `<server_snapshot>` and are described as data. Even if a name steers the model, its output still has to pass validation and a human review.
- **Human in the loop:** only the requester can Apply, and Manage Server is re-checked on every click. Plans expire after 15 minutes and are claimed before running, so a double click applies once.
- **Reversible:** each created object is recorded the moment it exists; Undo deletes only those IDs.
- **Cost and abuse:** 5 builds per server per hour, 500-character requests, `max_tokens` 16000. The API key is server-side only; the model's answers and errors are never echoed raw.
- **Refusals:** server-side fallback (`fallbacks: "default"`) retries a declined request on another model inside the same call; a final refusal is reported plainly.

## Metrics and the status page

- **Counts, never content:** message counts per server per day, last-posted times per member, hourly command timings and a heartbeat. No message text, and Message Content stays off.
- The bot can insert and update only the count and timing columns; the dashboard can only read them; `anon` and `authenticated` have no grants. `bot_status` is held to one row by a check constraint.
- `/status` is public and shows only Garrison-wide numbers (heartbeat, uptime, p95 across all servers), never per-server data. If the database can't be reached, it says so instead of showing an error.
- The theme cookie holds only `dark` or `light`. It's set by a Server Action that redirects only to local paths.

## Discord

- Intents: `Guilds`, `Guild Moderation`, `Guild Voice States`, `Guild Messages` and `Server Members` only. Message Content is not requested: Ranks counts messages by author and time only.
- Ledger stores who did what and when, never message content. Partials are enabled only so leave and delete events arrive for uncached members and messages.
- Level rewards can never carry moderation or admin permissions. The check runs when a reward is set and again at every grant.
- Anti-nuke trusts only the owner, Garrison itself and the owner's trusted list. Changing anti-nuke settings and restoring a quarantine are owner/trusted-only, checked in code on every command and click. At the database level `garrison_bot` can update settings; the owner check lives in the bot.
- Actions taken through Garrison are attributed to the moderator who ran them, not to Garrison, so Garrison can't be used to launder a mass ban.
- Invite permissions are listed in the README; never request Administrator.
- Reset the bot token in the Developer Portal immediately if it is ever exposed. Discord also auto-revokes tokens found in public GitHub repositories.

## Deployment

- The bot and dashboard **refuse to start** if their database login is a superuser, bypasses row-level security, or isn't their own role (`garrison_bot` / `garrison_web`).
- Images run as the unprivileged `node` user on a read-only filesystem, with all Linux capabilities dropped and `no-new-privileges` (see `docker-compose.yml`). Only Caddy publishes ports; the bot has none.
- Each container gets only the variables it needs. The `postgres` migration string never goes to a server: migrations run from a trusted machine.
- `.env` is excluded from images (`.dockerignore`). A proxy CA, if needed at build time, is a BuildKit secret and never stored in a layer.
- Health endpoints (`/healthz`) return only "ok" or "starting".

## CI and dependencies

- CI runs with `contents: read`, no secrets, and does not persist checkout credentials.
- `pnpm audit --prod --audit-level high` fails the build on known high or critical vulnerabilities.
- Dependabot opens weekly update PRs for npm packages and GitHub Actions.
- `pnpm` only runs install scripts for allow-listed packages (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).
