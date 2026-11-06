# Garrison

**Guard the gate. Rally the squad.**

Garrison is an all-in-one Discord bot for gaming communities: moderation, security, LFG and raid signups in one fast bot.

## Repository layout

```
apps/
  bot/          discord.js bot (slash commands, events)
packages/
  brand/        design tokens (CSS + TS), embed colours, module names
  db/           Drizzle schema, SQL migrations and queries for Supabase Postgres
```

Planned: `apps/web` (Next.js dashboard and marketing site, using `@garrison/brand`).

## Modules

| Module        | Plain label       | Status    | Commands                                                                    |
| ------------- | ----------------- | --------- | --------------------------------------------------------------------------- |
| Watch         | Moderation        | **Built** | `/warn` `/timeout` `/kick` `/ban` `/purge` `/case` `/history` `/moderation` |
| Gatehouse     | Security          | Planned   | `/lockdown` `/verify`                                                       |
| Ledger        | Logs              | Planned   | `/logs`                                                                     |
| Rally         | Looking for group | Planned   | `/lfg`                                                                      |
| Ops           | Events            | Planned   | `/event` `/raid`                                                            |
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
- Alerts go to `/security alert_channel`, or to the Watch log channel if none is set.

### Intents

`Guilds` plus **Server Members** (privileged). Turn on *Server Members Intent* under Bot in the Developer Portal, or login fails with "Used disallowed intents".

## Getting started

Requirements: Node 22+, pnpm 10 (`corepack enable`).

```sh
pnpm install
cp .env.example .env        # fill in Discord and Supabase values
pnpm db:migrate             # apply migrations to Supabase
pnpm commands:deploy        # register slash commands
pnpm dev                    # run the bot with reload
```

**Discord app setup:** create an application in the [Developer Portal](https://discord.com/developers/applications), add a bot, and invite it with the `bot` and `applications.commands` scopes plus these permissions: Moderate Members, Kick Members, Ban Members, Manage Messages, Manage Channels, Manage Roles, Manage Server (to pause invites), Read Message History, Send Messages, Embed Links. Drag Garrison's role above the roles it moderates.

**Supabase:** project `Garrison` (`pijtbyfnhdxhtyidgcda`, us-west-2) has every migration applied. Every table has row-level security on with no policies, so the public API exposes nothing. The bot connects with the database connection string, not the anon key.

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
