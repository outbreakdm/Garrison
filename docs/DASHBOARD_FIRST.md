# Dashboard first: plan and handoff

Garrison is moving from "a Discord bot with a dashboard" to "a dashboard, with a
small bot in Discord". The website is where things are done; the bot does the work
in Discord and keeps a few commands for convenience. This file is the running plan.
Whoever picks the work up next (a person or a Claude session) should start here,
then update the Status section before stopping.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Nothing is Discord-only for managers | **Done**, deployed from branch `dashboard-first` |
| 2 | Dashboard as home: what needs attention, setup checklist, instant feedback | **Started**: Needs attention is on the overview (step 1). Checklist, feedback and Rally on `RequestsPanel` remain |
| 3 | Slim the bot: settings commands become link replies, `/dashboard`, link buttons | Not started |
| 4 | Member pages: people without Manage Server use the site too | Not started, needs an owner decision (below) |
| 5 | Landing page and README copy say "dashboard first" | **Started**: the landing page was rebuilt around the dashboard. README still describes slash commands first |

Open decisions for the owner:

- **Member pages (phase 4): in or out?** Today the dashboard opens only for people
  with Manage Server. Members still join groups, sign up for raids and check their
  rank in Discord.
- **Settings slash commands (phase 3): remove them, or keep them replying with a
  link to the right dashboard page?** The plan assumes link replies.

## What phase 1 added

Everything goes through the request queue: the dashboard writes a row, the bot
claims it, checks it again, acts in Discord, and writes a short outcome.

- **Watch**: member search (name or user ID) and a page per member at
  `/servers/[guildId]/watch/member/[userId]` with rank, roles, cases, and warn,
  time out, kick and ban. "Clear messages" replaces `/purge`.
- **Rally**: post a group, join or leave one, sign up for or withdraw from a raid.
- **Quartermaster**: describe a build, see the server with the plan's changes
  (`components/ServerPreview.tsx`, `lib/qm-preview.ts`), then build or discard.
- **Request kinds** added to `dashboard_action_kind`: `mod_action`, `purge`,
  `create_lfg`, `lfg_join`, `lfg_leave`, `raid_signup`, `raid_withdraw`,
  `qm_plan`, `qm_apply`, `qm_cancel` (migration `0021_dashboard_first`).
- **Site art**: `apps/web/art/slots.json` lists the slots and prompts,
  `apps/web/public/art/` holds the files. See "Art" below.

Not yet proven against real Discord (unit tests and the local preview only):
warn, time out, kick, ban, clearing messages, posting a group, and building a plan
from the dashboard. Try each once on a test server after a deploy. Member search
uses Discord's `GET /guilds/{id}/members/search`, also untested live.

## Phase 2: the dashboard as home

Goal: opening a server shows what needs doing, not a set of numbers.

1. **Needs attention** at the top of the overview
   (`apps/web/app/servers/[guildId]/page.tsx`): an active lockdown, members in
   quarantine, a Quartermaster plan waiting, raids short of players, failed
   requests in the last day, health checks that aren't ok. Each item links to the
   page that fixes it. Show nothing when there is nothing.
2. **Setup checklist** for a new server: log channel, verification, anti-raid,
   ranks on or off, first raid or template. Derive each step from stored settings;
   hide the checklist once every step is done or it is dismissed (a per-server
   setting through `applySettingsChange`, so it is in history).
3. **Instant feedback**: `RequestsPanel` already refreshes while a request is
   pending. Make the outcome land where the user is looking: show the result
   beside the control that was used (member page, raid card, plan), not only in
   the panel. Consider shortening the bot's poll interval
   (`ACTIONS_INTERVAL_MS` in `apps/bot/src/index.ts`).
4. Move the Rally page onto `RequestsPanel`; it still has its own copy of the
   requests table and notice strings.

## Phase 3: a smaller bot

1. Add `/dashboard`: replies with a link button to the server's dashboard.
2. Settings commands (`/moderation`, `/security`, `/verify setup`,
   `/ledger settings`, `/ranks settings|reward|unreward`, `/raid timezone`) reply
   with a link to the matching page instead of changing anything. The page map is
   `PLACES` in `apps/web/app/servers/[guildId]/settings/actions.ts`.
3. Add a link button ("Open in dashboard") to case confirmations, raid cards and
   Quartermaster plan embeds.
4. Keep as they are: `/warn`, `/timeout`, `/kick`, `/ban`, `/purge`, `/lfg`,
   `/raid create`, `/rank`, `/leaderboard`, `/lockdown`, and every button on a
   card. These are the "double capabilities".
5. Re-register commands on deploy (`register_commands=true`).

## Phase 4: member pages (if the owner says yes)

A signed-in member of a server without Manage Server gets a reduced view: open
groups and raids with join and signup, their own rank and cases, the leaderboard,
their linked accounts. Needs a second access level beside `checkGuildAccess`
(`apps/web/lib/session.ts`), and the bot's `requester()` in
`apps/bot/src/modules/dashboard/actions.ts` must stop requiring Manage Server for
the member-level kinds (`lfg_join`, `lfg_leave`, `raid_signup`, `raid_withdraw`)
while keeping it for everything else. Treat this as a security change: every
server page and action must state which level it needs, and tests must cover a
member trying each manager action.

## Phase 5: say it

Landing page (`apps/web/app/page.tsx`) module cards and the README still describe
slash commands first (the Watch card reads "/warn, /timeout, /ban, /purge…").
Rewrite them around the dashboard, and add a screenshot of the Quartermaster
preview.

## How to add a dashboard action

1. `packages/db/src/schema.ts`: add the kind to `dashboardActionKind` and a
   payload interface. `packages/db/src/repo/actions.ts`: add it to `QueueInput`.
2. `pnpm db:generate --name <what>`, then make each `ADD VALUE` an
   `ADD VALUE IF NOT EXISTS` so the migration can be re-run.
3. Web: a case in `build()` in `apps/web/app/servers/[guildId]/requests.ts`
   (validate, and check what it points at belongs to this server), a label in
   `ACTION_KIND` (`apps/web/lib/rally-schema.ts`), any new error string in
   `components/RequestsPanel.tsx`.
4. Bot: a `do…` handler in `apps/bot/src/modules/dashboard/more.ts` that parses
   the payload again with zod and checks the requester's own Discord permission,
   then a case in `runDashboardAction` (`actions.ts`).
5. A test in `apps/bot/src/modules/dashboard/actions.test.ts`.

## Rules that are easy to break

- **CSP**: the site allows no inline styles. Use classes; for a dynamic colour use
  an SVG `fill` attribute (see the role dots in `ServerPreview.tsx`). Images may
  only come from the site itself, `data:` and `cdn.discordapp.com`.
- **The dashboard never acts in Discord itself.** It only reads with the bot
  token and queues requests. Never trust the row: the bot re-validates.
- **The repo is public.** Never commit `.env*`, `.claude/launch.json`, or
  anything with a real ID, token or name in it.
- **Copy**: plain words, no eyebrow labels above headings, say what happened and
  what to do next. Settings live on the page they affect; the Settings page keeps
  only server-wide and account settings.
- **Checks before pushing**: `pnpm -r exec tsc --noEmit`, `pnpm test`,
  `pnpm exec biome check apps packages` (warnings about
  `noDescendingSpecificity` are known).

## Deploying

Nothing deploys on push. The deploy is the manual workflow
`.github/workflows/deploy-cloudflare.yml`:

```bash
gh workflow run deploy-cloudflare.yml --ref <branch> -f target=everything -f register_commands=true
```

Use `target=dashboard -f register_commands=false` when only `apps/web` changed.

**Migrations are not part of the workflow.** When a change adds one, it has to be
applied to the production database separately, from a machine that has
`DATABASE_MIGRATION_URL` in `.env`: `pnpm db:migrate` (see `DEPLOY.md`). Until
`0021_dashboard_first` is applied, every phase 1 button fails with an error;
everything older keeps working.

## Art

1. Prompts for every slot are in `apps/web/art/PROMPTS.md` (written from
   `slots.json` by `pnpm art`).
2. Drop a raw PNG or JPG named after its slot into `apps/web/public/art/`.
3. `pnpm art:optimize` crops and resizes it to the slot and writes WebP (JPG for
   the link preview). It removes the raw file, so keep originals elsewhere.
4. `pnpm art` updates `apps/web/lib/art.generated.json`. Commit both.

A slot with no file shows nothing, so pieces can arrive one at a time.

## Looking at the site locally

There is no local bot. The dashboard can run against a throwaway Postgres and the
stand-in Discord server in `apps/web/e2e/mock-discord.cjs` (port 4100):

- Postgres 16 in Docker, migrated with `DATABASE_URL=… pnpm db:migrate`, with the
  `garrison_web` and `garrison_bot` roles given test passwords.
- `next dev` started with `DISCORD_API_BASE=http://127.0.0.1:4100`,
  `DISCORD_TOKEN=test-bot-token`, `WEB_DATABASE_URL` pointing at that Postgres.
- A row in `web_sessions` and its cookie (`garrison_session` in development) to
  be signed in. The mock knows one server, `111111111111111111`.

Requests queued locally stay "Queued" until they expire, because nothing claims
them. To see a Quartermaster plan, insert a `qm_builds` row with status `pending`.
