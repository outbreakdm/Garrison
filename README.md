# Garrison

**Guard the gate. Rally the squad.**

Garrison is an all-in-one Discord bot for gaming communities: moderation, security, LFG and raid signups in one fast bot.

## Repository layout

```
apps/
  bot/          discord.js bot (slash commands, events)
  web/          Next.js dashboard (Discord login, read-only server views)
packages/
  brand/        design tokens (CSS + TS), embed colours, module names
  db/           Drizzle schema, SQL migrations and queries for Supabase Postgres
```

## Modules

| Module        | Plain label       | Status    | Commands                                                                    |
| ------------- | ----------------- | --------- | --------------------------------------------------------------------------- |
| Watch         | Moderation        | **Built** | `/warn` `/timeout` `/kick` `/ban` `/purge` `/case` `/history` `/moderation` |
| Gatehouse     | Security          | **Built** | `/lockdown` `/verify` `/security`                                           |
| Ledger        | Logs              | Planned   | `/logs`                                                                     |
| Rally         | Looking for group | **Built** | `/lfg`                                                                      |
| Ops           | Events            | **Built** | `/raid`                                                                     |
| Barracks      | Members           | Planned   | `/link` `/roster`                                                           |
| Ranks         | Leveling          | Planned   | `/rank` `/leaderboard`                                                      |
| Quartermaster | AI builder        | Planned   | `/qm`                                                                       |

### Watch

- Every action creates a numbered **case** (per server, never reused). Embeds carry `Watch · case #N`.
- **Undo** on every confirmation: revokes a warning, lifts a timeout, or unbans. Kicks and purges can't be reversed.
- **Escalation rules**: new servers start with _3 warnings in 24 h → 1 h timeout_. Rules fire once, as the count reaches the threshold. Undone warnings stop counting.
- **Role checks before acting**, with errors that name the fix ("Drag Garrison above it in Server Settings → Roles").
- Members get a neutral DM with the reason and how to appeal (`/moderation dm_members` and `appeal_text`).
- `/moderation log_channel:#mod-log` posts every case to a channel.

### Gatehouse

- **Anti-raid**: watches the join rate. By default, 10 joins in 30 s is a raid. Garrison then locks the server, pauses invites and lifts the lockdown after 15 min, or only alerts if you set `raid_response:Alert only`. One raid gives one alert.
- **`/lockdown start|end|status`**: denies posting, threads, reactions and polls to @everyone in every channel it can see, while staff roles (`/security staff_role_add`) keep talking. Every overwrite it changes is saved first, so `/lockdown end` restores each channel exactly as it was. Private channels are left alone.
- **New-account flags**: joins from accounts under 7 days old get an alert ("Flagged a 2-day-old account on join").
- **`/verify setup`**: posts a Verify button that gives a role, with an optional minimum account age.
- **Anti-nuke**: watches the audit log. One actor making 3 channel or role deletions, or 5 bans and kicks, within 60 s is quarantined: Garrison removes every role it can, saves the list, and posts an alert with a **Restore roles** button only the owner or a trusted user can use. Rogue bots are kicked. Giving @everyone a dangerous permission (Administrator, Manage Server, Ban Members…) is reverted on the spot. Bans and kicks made through Garrison's own `/ban` and `/kick` count against the moderator who ran them.
- Anti-nuke settings and the trusted list (`/security anti_nuke`, `trusted_add`…) are **owner-only**, so a compromised admin can't switch it off first. Keep Garrison's role at the top of the role list, or it can't strip roles above it.
- Alerts go to `/security alert_channel`, or to the Watch log channel if none is set.

### Rally

- **`/lfg create`** posts a card anyone can join: numbered slots (`size:5`) or roles (`roles:Tank 1, Healer 1, DPS 3`), a start time (`starts:10m`) and a note (`note:rank Gold+`). Buttons: **Join as …**, **Leave**, **Close group**. The card shows Open, 1 left or Full.
- When the squad fills, Garrison opens a voice channel only the squad can join, and pings just those members: "Squad's full. Voice is open." Empty squad channels are removed after 5 min. Garrison only deletes channels it recorded creating.
- One open group per person per server. Groups close 3 h after they start, or when the host leaves.
- `/lfg list` shows open groups; `/lfg close` closes yours. The host or anyone with Manage Messages can close a card.

### Ops

- **`/raid create`** (Manage Events) posts a roster card: `when:2026-11-12 8pm` in the server's time zone (set once with `/raid timezone America/Chicago`, or per raid with `timezone:`), `roles:Tank 4, Healer 8, DPS 28`, an optional note and `repeat_weekly`.
- **Sign up as …** asks for an optional class or spec ("Prot", "Resto"). A full role puts you on the **bench**; when someone withdraws, the earliest benched player for that role moves up and is told so.
- The card shows each role's cap ("Tank · 2/4"), who's in with their spec, the bench, and a shortage badge ("2 Tank short") or Ready.
- **Reminders** 24 h and 30 min before ping only the players signed up, never the bench or anyone else.
- Weekly raids repost themselves after each run at the same local time, across daylight-saving changes.
- `/raid list` shows what's coming up. The host or anyone with Manage Events can cancel. A server can hold 25 scheduled raids.

### Health

`/health` checks Garrison's permissions per module, its role position (roles with moderation powers above Garrison are anti-nuke's blind spot), the log and alert channels, the verify and staff roles, and whether protections are on. If permissions are wrong, a **Fix permissions** button re-invites Garrison with exactly the set it uses (never Administrator, and it warns if Garrison has it).

### Intents

`Guilds`, `Guild Moderation` (audit log, for anti-nuke), `Guild Voice States` (Rally) and **Server Members** (privileged). Turn on _Server Members Intent_ under Bot in the Developer Portal, or login fails with "Used disallowed intents".

## Dashboard

`apps/web` is a Next.js 16 dashboard. Sign in with Discord to see the servers you manage: an **Overview** (mod actions, open groups, next raid, Gatehouse status, recent cases), **Watch** (the latest 50 cases), **Gatehouse** (lockdown, anti-raid and anti-nuke settings) and **Rally** (open groups and raid rosters). It is read-only for now: settings change through slash commands.

```sh
pnpm --filter @garrison/web dev     # http://localhost:3000
```

Set `APP_URL`, `DISCORD_CLIENT_SECRET` and `WEB_DATABASE_URL` in `.env`, and add `APP_URL/auth/callback` as an OAuth2 redirect in the Developer Portal. See SECURITY.md for how sign-in is protected.

## Getting started

Requirements: Node 22+, pnpm 10 (`corepack enable`).

```sh
pnpm install
cp .env.example .env        # fill in Discord and Supabase values
pnpm db:migrate             # apply migrations to Supabase
pnpm commands:deploy        # register slash commands
pnpm dev                    # run the bot with reload
```

**Discord app setup:** create an application in the [Developer Portal](https://discord.com/developers/applications), add a bot, and invite it with the `bot` and `applications.commands` scopes plus these permissions: Moderate Members, Kick Members, Ban Members, Manage Messages, Manage Channels, Manage Roles, Manage Server (to pause invites), View Audit Log (for anti-nuke), Connect (Rally voice), Read Message History, Send Messages, Embed Links. Drag Garrison's role above the roles it moderates.

**Supabase:** project `Garrison` (`pijtbyfnhdxhtyidgcda`, us-west-2) has every migration applied. The bot runs as the least-privilege `garrison_bot` role, and the public Data API can reach nothing. Enable the role's login once as described in [SECURITY.md](SECURITY.md#enabling-the-bot-role).

## Security

See [SECURITY.md](SECURITY.md) for the principles and the checklists for new tables and commands.

## Scripts

| Command                                        | What it does                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                                     | Run the bot with `tsx watch`                                                       |
| `pnpm build`                                   | Bundle the bot to `apps/bot/dist`                                                  |
| `pnpm test`                                    | Unit tests, plus DB tests on in-memory Postgres (PGlite) using the real migrations |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Types and Biome                                                                    |
| `pnpm db:generate`                             | Create a migration after editing `packages/db/src/schema.ts`                       |
| `pnpm db:migrate`                              | Apply migrations (uses `DATABASE_MIGRATION_URL`)                                   |
| `pnpm commands:deploy`                         | Register slash commands (to `DISCORD_DEV_GUILD_ID` if set, else globally)          |

## Brand

Copy follows the Garrison Brand Guide: calm, brief, specific. Sentence case, numbers over adjectives, every confirmation offers undo, errors give the fix, no "Powered by" footers. Colours and fonts come from `@garrison/brand`, which mirrors the design system tokens.
