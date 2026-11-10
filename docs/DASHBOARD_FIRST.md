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
| 2 | Dashboard as home: what needs attention, setup checklist, instant feedback | **Done** on branch `claude/sweet-sagan-jrl5aa`, not deployed yet. Migrations `0021` and `0022` are applied in production (by hand) |
| 3 | Slim the bot: settings commands become link replies, `/dashboard`, link buttons | **Done** on branch `claude/sweet-sagan-jrl5aa`, not deployed yet. Deploy `everything` with `register_commands=true` |
| 4 | Member pages: people without Manage Server use the site too | Not started, needs an owner decision (below) |
| 5 | Landing page and README copy say "dashboard first" | Not started. **Next** unless phase 4 is a yes. The README's command lines were corrected in phase 3 |

**Layout pass** (after phase 3): done on branch `claude/sweet-sagan-jrl5aa`, not
deployed yet. Dashboard only, apart from one health-check sentence in the bot, so
`target=dashboard` is enough. See "What the layout pass changed".

**Bot replies pass**: done on the same branch, not deployed. Bot only, so
`target=bot`; commands didn't change shape, so `register_commands=false` is fine.

Open decisions for the owner:

- **Member pages (phase 4): in or out?** Today the dashboard opens only for people
  with Manage Server. Members still join groups, sign up for raids and check their
  rank in Discord.

Decided:

- **Settings slash commands (phase 3) stay, and reply with a link** to the
  matching dashboard page instead of changing anything (owner).

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

## What phase 2 added

Opening a server now shows what needs doing first.

- **Needs attention** at the top of the overview: an active lockdown, members
  quarantined by anti-nuke (not kicked bots), health checks that aren't ok, a
  build that stopped partway, a Quartermaster plan waiting, raids in the next 48 h
  that are short, and failed requests from the last day (unless the same kind
  worked since). Each links to the card that fixes it. Nothing shows when nothing
  needs doing. The rules are in `apps/web/lib/attention.ts`, unit tested.
- **Setup checklist** under it: log channel, verification, anti-raid with a
  channel for alerts, Ranks decided (on, or saved off), and Rally used (a raid, a
  group or a template). Each step is worked out from stored settings by
  `getSetupFacts` (`packages/db/src/repo/home.ts`). It goes away when every step is
  done, or with "Hide checklist", which is a setting: new module `dashboard`, table
  `dashboard_settings`, field `setupDismissed`, migration `0022_dashboard_home`.
  It shows in Settings history and Undo there brings the checklist back. Until
  `0022` is applied the overview works without the checklist.
- **Results beside the button**: request forms send `at`, the ID of the card they
  came from. The action redirects back to that card (`back.ts`), and `<Outcome>`
  shows your latest request from it (queued, working, done or failed, with the
  bot's message) or why it wasn't queued. The Requests panel then skips its own
  notice. Done on the overview's health card, Rally group and raid cards, the
  member page (Moderate, Cases), Quartermaster (describe, plan, each build),
  Security (lockdown, verification, anti-nuke, quarantines) and Watch (clear
  messages, cases). The page's `RequestsPanel` must list the kinds a card sends,
  because its auto-refresh is what updates the result.
- The bot checks for requests every 2 s instead of 5 s (`ACTIONS_INTERVAL_MS`).
- Rally uses `RequestsPanel` like every other page. Request error strings live
  in one place, `REQUEST_ERRORS` in `apps/web/lib/outcome.ts`.

Not yet proven against real Discord: same as phase 1. The flows above were
checked in a browser against the local stand-in (hide and undo the checklist,
withdraw from a raid, a cooldown error on a raid card, warn from a member page),
and a production build showed no CSP violations on any server page.

## What phase 3 added

Settings are changed only on the dashboard now, so every change is in Settings
history with undo. Discord keeps the actions and lookups.

- **`/dashboard`** (Manage Server): a link button to the server's dashboard.
- **Settings commands show and link.** `/moderation`, `/security`, `/verify
  setup|off`, `/logs settings`, `/ranks settings|reward|unreward` and `/raid
  timezone` take no options any more. Each replies privately with the current
  values and a button to the page and panel that changes them (`settingsReply`
  in `apps/bot/src/lib/dashboard.ts`). A test fails if any of them gets an option
  back.
- **Links on private replies**: case confirmations, `/case` and `/history` (the
  member's page), `/logs search` (their Ledger events), `/raid list` (Rally),
  Quartermaster plans ("See it on the dashboard", the visual preview), built
  plans and `/qm history`.
- **Not on public cards.** Raid and group cards are seen by every member, and
  only managers can open the dashboard, so they get no link until phase 4 is
  decided. If phase 4 is a yes, add one there.
- Health checks, the anti-nuke bot-kick alert, the Verify error and the Ranks
  "off" message point at the dashboard instead of old command options.
- **The bot now knows the dashboard's address.** It reads `APP_URL`, which the
  Cloudflare bot never received before (so `/link accounts` said the dashboard
  wasn't set up). `scripts/cf-config.mjs` fills it into
  `apps/bot-cloudflare/wrangler.jsonc` from the same GitHub variable as the
  dashboard, and `docker-compose.yml` passes it too. Without it, replies say the
  bot doesn't know the dashboard's address and show no buttons.

Kept as they are: `/warn`, `/timeout`, `/kick`, `/ban`, `/purge`, `/lfg`, `/raid
create|list`, `/rank`, `/leaderboard`, `/lockdown`, `/case`, `/history`, `/logs
search`, `/qm`, `/link`, `/roster`, `/health`, and every button on a card.

Not yet proven in real Discord: the new replies were tested with unit tests
(`apps/bot/src/lib/dashboard.test.ts`) against a test database, not a live
server. After deploying, run `/dashboard`, `/moderation` and `/ranks reward`
once and press their buttons.

## What the layout pass changed

Every page was gone over for how easy it is to read and find things.

- **One name per page, in plain words.** `apps/web/lib/pages.ts` names every page
  once: Moderation (Watch), Security (Gatehouse), Event log (Ledger), Groups and
  raids (Rally), Game accounts (Barracks), Levels (Ranks), Server builder
  (Quartermaster). The menu, each page's title, the search index and the Settings
  page read from it. The module name stays small beside the title, because
  members see it in Discord ("Watch · case #14"). URLs didn't change.
- **Menu and top bar.** The menu is grouped Safety, Community, Setup. The top bar
  has one menu for the signed-in person (account, theme, sign out), so it stays
  one row on a phone.
- **Headings.** `PageHead` and `CardHead` (`components/PageHead.tsx`) give every
  page a title, a sentence on what it's for, and real `h2` card titles. Sub-pages
  (a member, LFG templates, your account) link back to the page above them.
- **Requests.** `RequestsPanel` shows only what is in progress or finished in the
  last ten minutes; `RequestsHistory` folds earlier ones away at the bottom of
  the page. Both take the page's own `actions`; a member's page passes `match`
  so it lists only requests about that member.
- **One way in.** Page settings are a `SettingsPanel` at the bottom of the page,
  opened by the "Settings" link in the page head. Forms opened from page-head
  buttons (`form-card`) aren't shown while closed.
- **Per page.** Overview: plain-word numbers, the next raid with how full each
  role is, security and health beside it. Moderation: search and cases first,
  then what warnings lead to, then settings. Security: lockdown on top, each
  protection explained with its state. Event log: member names instead of IDs,
  and the member filter takes a name. Levels: rewards show the rows in use plus
  two blank ones, and clearing a row's role removes that reward.
- **Times** read "3 h ago" (`<When>` in `components/format.tsx`, `lib/time.ts`),
  with the exact time on hover.

Checked on a production build: every page at 1280 and 390 px wide returns 200
with no console or CSP errors and no sideways scroll; the changed interactions
were driven in a browser; `apps/web/e2e/settings.e2e.cjs` passes. That script
needs a fresh database: it assumes the server has one Moderation settings change.

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
   `REQUEST_ERRORS` (`apps/web/lib/outcome.ts`), and where a failure links to in
   `requestPage` (`apps/web/lib/attention.ts`). Give the form a hidden `at` with
   its card's ID and put an `<Outcome>` in that card (`latestOutcome` +
   `errorAt`), and add the kind to that page's `RequestsPanel`.
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
- **Names**: a page is called what `apps/web/lib/pages.ts` calls it, everywhere.
  Add a page there first. Don't write "Watch page" or "Ledger" in dashboard copy.
- **Copy**: plain words, no eyebrow labels above headings, say what happened and
  what to do next. Card and section titles are headings (`CardHead`, `h2`), not
  `g-label`; keep `g-label` for table headers and small field labels. Settings live on the page they affect; the Settings page keeps
  only server-wide and account settings.
- **Bot replies are embeds, in three kinds only** (`apps/bot/src/lib/embeds.ts`):
  no colour for most things (cards, lists, records, log lines, notices), green
  (`done`) for a confirmation that what was asked for happened, red (`danger`)
  for an error or a confirmation of something severe or hard to undo (kick, ban,
  cleared messages, lockdown, security alerts, "are you sure?"). One-line replies
  use `info()`, `done()` or `failed()`. Plain text is only for messages that have
  to ping someone, because mentions inside an embed don't notify. A test fails
  if an embed sets its own colour or a reply goes out as plain text.
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
until `0022_dashboard_home` is applied, the overview has no setup checklist.
Everything older keeps working. Both are safe to re-run.

`pnpm db:migrate` is `packages/db/scripts/migrate.mjs`, not `drizzle-kit migrate`
(which hides the database's error). It reads the root `.env` in any encoding,
applies each missing migration in its own transaction, keeps drizzle's record so
drizzle-kit agrees, and explains connection errors, including using
`garrison_web` or `garrison_bot` instead of the admin login. For a database
built without drizzle's record it says which migrations are there and prints a
`--baseline` command.

`0021` and `0022` were applied to production by hand, so drizzle's record there
doesn't list them: the next `pnpm db:migrate` runs them again (harmless, both
are idempotent) before any newer one.

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

- Postgres 16 (Docker, or the `postgresql-16` binaries with `initdb` and
  `pg_ctl` on port 55432), migrated with
  `DATABASE_MIGRATION_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm db:migrate`,
  with the `garrison_web` and `garrison_bot` roles given test passwords.
- `next dev` started with `DISCORD_API_BASE=http://127.0.0.1:4100`,
  `DISCORD_TOKEN=test-bot-token`, `WEB_DATABASE_URL` pointing at that Postgres.
- A row in `web_sessions` (its `token_hash` is the SHA-256 of the cookie value)
  and its cookie (`garrison_session` in development, `__Host-garrison_session`
  in a production build) to be signed in. The mock knows one server,
  `111111111111111111`.
- To see "Needs attention", insert an active `lockdowns` row, a `quarantines`
  row, a `failed` row in `dashboard_actions`, or an `ops_events` raid a few hours
  out with few `ops_signups`.

Requests queued locally stay "Queued" until they expire, because nothing claims
them. To see a Quartermaster plan, insert a `qm_builds` row with status `pending`.
