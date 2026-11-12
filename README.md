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
| Ledger        | Logs              | **Built** | `/logs`                                                                     |
| Rally         | Looking for group | **Built** | `/lfg`                                                                      |
| Ops           | Events            | **Built** | `/raid`                                                                     |
| Barracks      | Members           | **Built** | `/link` `/unlink` `/roster`                                                 |
| Ranks         | Leveling          | **Built** | `/rank` `/leaderboard`                                                      |
| Insignia      | Role menus        | **Built** | (dashboard)                                                                 |
| Herald        | Welcome           | **Built** | (dashboard)                                                                 |
| Dispatch      | Messages          | **Built** | (dashboard)                                                                 |
| Parley        | Tickets           | **Built** | `/ticket`                                                                   |
| Beacon        | Alerts            | **Built** | (dashboard)                                                                 |
| Spoils        | Giveaways         | **Built** | `/giveaway`                                                                 |
| Honors        | Starboard         | **Built** | (dashboard)                                                                 |
| Quartermaster | AI builder        | **Built** | `/qm`                                                                       |

### Watch

- Every action creates a numbered **case** (per server, never reused). Embeds carry `Watch · case #N`.
- **Undo** on every confirmation: revokes a warning, lifts a timeout, or unbans. Kicks and purges can't be reversed.
- **Escalation rules**: new servers start with _3 warnings in 24 h → 1 h timeout_. Change the ladder on the dashboard's Watch page. Rules fire once, as the count reaches the threshold. Undone warnings stop counting.
- **Role checks before acting**, with errors that name the fix ("Drag Garrison above it in Server Settings → Roles").
- Members get a neutral DM with the reason and how to appeal (`/moderation dm_members` and `appeal_text`).
- `/moderation log_channel:#mod-log` posts every case to a channel.

- **Automod** (Watch → Automod on the dashboard): blocked words and phrases (whole words, any case, through zero-width tricks; 25 on Free, 250 on Pro), invites to other servers, too many mentions, and message spam. A hit removes the message, then does nothing more, warns (which counts toward the ladder) or times out; at most one case per member every 30 s. Staff with Manage Messages, exempt roles and exempt channels are never checked.
- **AI moderation (Pro):** OpenAI's free moderation model (`omni-moderation-latest`) scores each message for the categories the server picks, at its strictness. Needs `OPENAI_API_KEY` on the bot; capped at 60 checks per server per minute. Self-harm is never punished: Garrison only alerts the staff in the Watch log so someone can check on the person.
- **Staff notes:** `/note add` and `/note list`, and the Notes section on a member's dashboard page. Members never see them; removed notes are kept, marked removed.
- **Appeals:** with *Take appeals on a page of their own* on (Watch settings), anyone with an active case can appeal at `/appeal/<server ID>` after signing in with Discord: one open appeal at a time, a week's wait after a denial. Appeals queue on the Watch page; staff accept (optionally undoing the case) or deny, with a reply the member reads on the appeal page. With the appeal text blank, moderation DMs link to the page.
- **Temporary bans:** `/ban length:` (1 hour to 90 days) or the dashboard's ban form. The minute sweep lifts them when their time is up, marks the case undone by Garrison and says so in the log.
### Gatehouse

- **Anti-raid**: watches the join rate. By default, 10 joins in 30 s is a raid. Garrison then locks the server, pauses invites and lifts the lockdown after 15 min, or only alerts if you set `raid_response:Alert only`. One raid gives one alert.
- **`/lockdown start|end|status`**: denies posting, threads, reactions and polls to @everyone in every channel it can see, while staff roles (`/security staff_role_add`) keep talking. Every overwrite it changes is saved first, so `/lockdown end` restores each channel exactly as it was. Private channels are left alone.
- **New-account flags**: joins from accounts under 7 days old get an alert ("Flagged a 2-day-old account on join").
- **`/verify setup`**: posts a Verify button that gives a role, with an optional minimum account age.
- **Anti-nuke**: watches the audit log. One actor making 3 channel or role deletions, or 5 bans and kicks, within 60 s is quarantined: Garrison removes every role it can, saves the list, and posts an alert with a **Restore roles** button only the owner or a trusted user can use. Rogue bots are kicked. Giving @everyone a dangerous permission (Administrator, Manage Server, Ban Members…) is reverted on the spot. Bans and kicks made through Garrison's own `/ban` and `/kick` count against the moderator who ran them.
- Anti-nuke settings and the trusted list (`/security anti_nuke`, `trusted_add`…) are **owner-only**, so a compromised admin can't switch it off first. Keep Garrison's role at the top of the role list, or it can't strip roles above it.
- Alerts go to `/security alert_channel`, or to the Watch log channel if none is set.

- **Backups:** *Back up now* on the Gatehouse page snapshots roles, categories, channels and their permission overwrites. **Restore** (server owner only) recreates only what's missing, never deletes or edits what's there, moves overwrites onto recreated roles, grants only permissions Garrison holds, and remembers what it recreated so running it twice adds nothing. Free keeps 1 backup; Pro keeps 30 and can back up weekly by itself.
- **Alt-account warnings:** when someone joins with the same name as a member banned here in the last 90 days (ignoring case, symbols and trailing numbers), or a very similar name plus a young account or no avatar, the alert channel gets a warning naming the ban's case. Nothing is done to the member.
- **Website verification:** with *Verify on the website* on, the Verify button links to `/verify/<server ID>`: the member signs in with Discord (which a bot can't), passes a Cloudflare Turnstile captcha when the host has `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`, and Garrison gives the role through a request, checking the account age again.
### Rally

- **`/lfg create`** posts a card anyone can join: numbered slots (`size:5`) or roles (`roles:Tank 1, Healer 1, DPS 3`), a start time (`starts:10m`) and a note (`note:rank Gold+`). Buttons: **Join as …**, **Leave**, **Close group**. The card shows Open, 1 left or Full.
- When the squad fills, Garrison opens a voice channel only the squad can join, and pings just those members: "Squad's full. Voice is open." Empty squad channels are removed after 5 min. Garrison only deletes channels it recorded creating.
- One open group per person per server. Groups close 3 h after they start, or when the host leaves.
- **Weekly groups:** `/lfg create repeat_weekly:True` posts the group again a week later at the same local time (the server's raid time zone) once it has run, with the host back in their seat. Closing it early still keeps next week's; `/lfg close stop_repeating:True` ends the series. Run `pnpm commands:deploy` once for the new options.
- `/lfg list` shows open groups; `/lfg close` closes yours. The host or anyone with Manage Messages can close a card.
- **Templates** adapt Rally to any game by changing words, not code. On the dashboard (Rally → LFG templates), each template sets default roles or size, the group word ("squad", "fireteam", "raid"), every button label, the full-squad message, a requirement label ("Item level", "Rank"), which channels it can be posted in, how long posts stay open, and whether a voice channel opens. Players pick one with `/lfg create template:` (autocompleted), and anything they type still overrides the defaults. Six presets (Mythic+, Raid, Ranked, Fireteam, Bossing, Casual) are starting points. Posts keep the wording they were made with, and template edits have history and undo.

| Rally templates                                                  | Free | Pro |
| ---------------------------------------------------------------- | ---- | --- |
| Templates per server                                             | 3    | 25  |
| All wording, roles, channels, voice, lifetime                    | ✓    | ✓   |
| Notify a role when a post goes up (once per 15 min per template) |      | ✓   |

Wording is free because it's what makes Rally fit a game; Pro adds scale and pings for bigger multi-game communities. Plans are applied when templates are used, so a downgrade keeps the first three working and stops role notifications without deleting anything. Until billing exists, set a server's plan as the database owner: `insert into guild_plans (guild_id, plan) values ('<server id>', 'pro') on conflict (guild_id) do update set plan = excluded.plan;`

After pulling this change, run `pnpm commands:deploy` once: `/lfg create` has a new `template` option.

### Ops

- **`/raid create`** (Manage Events) posts a roster card: `when:2026-11-12 8pm` in the server's time zone (set once with `/raid timezone America/Chicago`, or per raid with `timezone:`), `roles:Tank 4, Healer 8, DPS 28`, an optional note and `repeat_weekly`.
- **Sign up as …** asks for an optional class or spec ("Prot", "Resto"). A full role puts you on the **bench**; when someone withdraws, the earliest benched player for that role moves up and is told so.
- The card shows each role's cap ("Tank · 2/4"), who's in with their spec, the bench, and a shortage badge ("2 Tank short") or Ready.
- **Reminders** 24 h and 30 min before ping only the players signed up, never the bench or anyone else.
- Weekly raids repost themselves after each run at the same local time, across daylight-saving changes.
- `/raid list` shows what's coming up. The host or anyone with Manage Events can cancel. A server can hold 25 scheduled raids.
- **From the website:** any member can join or leave groups and sign up for or leave raids at `/play/<server id>` (the player page, linked from Rally on the dashboard). It asks Garrison to do it, so the cards in Discord stay the source of truth.
- **Calendar:** Rally on the dashboard and the player page show five weeks of raids in the server's time zone, weekly raids included. **Make a link** under Calendar feed gives an ICS link for Google, Apple or Outlook calendars (`/calendar/<server id>/<secret>.ics`): raid names, times and notes only, never who signed up. **New link** cuts off the old one.
- **Attendance (Pro):** turn on **Track attendance from voice** under Rally → Attendance. Anyone signed up for a raid (not the bench) or in a group who is in a voice channel in the server from 10 minutes before the start to 45 minutes after counts as there; the rest are no-shows. The dashboard shows each member's record over 90 days and lets staff correct marks on recent raids. On Free the setting is kept but tracking pauses.

### Barracks

- **Opt-in per server.** `/link` in a server shares your linked accounts with that server's roster; `/link share visible:false` hides them. Members can remove any link or stop sharing on their dashboard **Account** page.
- **Verified, from Discord Connections:** `/link accounts` opens the Account page, where **Link from Discord Connections** imports the verified game accounts in Discord → Settings → Connections (Steam, Battle.net, Riot, Xbox, PlayStation, Epic, Bungie, Roblox). Only this flow asks Discord for `connections`; ordinary sign-in never does.
- **Verified, World of Warcraft:** Battle.net sign-in imports characters with level, class and realm. Turns on when `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET` are set; register `APP_URL/auth/battlenet/callback` as the redirect.
- **Claimed, Old School RuneScape:** `/link osrs name:Zezima` shows total and combat level from the public hiscores, refreshed every 6 h. OSRS can't prove ownership, so it's labelled claimed.
- **Claimed, RuneScape 3:** `/link rs3 name:` shows total level from the public hiscores, refreshed every 6 h with OSRS.
- **Roles from game stats (Pro):** on the dashboard's Barracks page, up to 10 rules like "OSRS total level 2000+ → @Maxed" (also OSRS combat level, RuneScape total level and WoW character level). Members get the role while an account they share with the server meets a rule and lose it when none does or they stop sharing; checked every 30 minutes and right after `/link`. Roles with admin or moderation powers are never given. Claimed accounts count, so these are for flair, not access.
- `/roster [game]` lists what members shared; the dashboard's Barracks page shows the same with verified or claimed badges. No Discord or Battle.net token is ever stored.

### Quartermaster

- **`/qm build request:"A WARDOGS section with ranked and casual LFG, a voice room and a Gold+ role for ranked"`** asks Claude for a plan and shows it as a diff. Nothing changes until the person who asked presses **Apply**.
- **Additive only:** categories, text and voice channels, and roles. It never edits or deletes anything that exists. New roles get **no permissions**; private channels get only view, send, read history, connect and speak for the listed roles.
- Every build is versioned (`v15`). **Undo** (or `/qm undo version:15`) removes exactly what that build created and nothing else, even after a partial failure. `/qm history` lists builds; the dashboard shows each plan.
- Limits: 5 builds per server per hour, 20 changes per build, plans expire after 15 minutes. Needs `ANTHROPIC_API_KEY`; uses `claude-opus-5-5` by default (`QM_MODEL`).

### Ledger

- Records **who did what, when**: joins and leaves (with account age), kicks, bans, timeouts, role and nickname changes, channel, role and permission edits (with exactly which permissions changed), invites, webhooks, bots added, deleted messages (author and channel), and voice joins, leaves and moves. The actor comes from Discord's audit log.
- **Message text is off by default.** With _Keep the text of deleted and edited messages_ on (Ledger settings on the dashboard), a deleted message's event keeps its text (up to 1,500 characters, and only for messages Garrison saw since its last restart) and edits are logged with the text before and after. The text lives in the event and is removed with it at retention.
- **Invites:** each join records the invite used and who made it (by comparing invite counts; needs Manage Server, and skipped during a burst of joins when counts can't tell people apart). The Ledger page shows the top inviters of the last 30 days.
- **CSV export (Pro):** *Download CSV* on the Ledger page exports what the current filter shows, up to 20,000 events.
- `/logs settings channel:#mod-log` posts each event there; `/logs search user:@member` shows a member's recent events. The dashboard's Ledger page filters by member and event type, with paging.
- Events are kept 30 days by default (`keep_days` 7–365). Expired events are removed by a database function that the bot may call but that only deletes rows past retention, and never newer than 7 days, so a compromised bot can't erase recent history.

### Parley (tickets)

- A **panel** (designed on the dashboard with the card editor) has one button per topic. Pressing one opens a private channel, `ticket-0042`, that only the member, the staff roles and people with Manage Server can see. Garrison grants only view, send and read history (and attach files if Garrison itself may).
- **Claim** and **Close** buttons in the ticket; `/ticket close`, `/ticket claim`, `/ticket add`, `/ticket remove`. The member who opened it can close it; everything else is staff only, checked on every press against the setup as saved now.
- **Transcripts:** every message written in an open ticket is recorded, with edits (latest text) and deletions (kept, marked deleted). This is why Garrison asks for Message Content. Closed tickets keep their transcript 30 days on Free and 365 on Pro, set when the ticket closes so a later downgrade never shortens it; then the ticket, transcript and notes are deleted. The bot can delete a ticket only once it has expired (row-level security).
- The dashboard's **Tickets** page has the queue (waiting on staff, waiting on the member, unclaimed, closed), search by number, member or transcript text, each ticket's transcript with staff-only notes, and Claim and Close.
- **Modmail:** with *Members can open a ticket by DMing Garrison* on, a member DMs Garrison, picks the server, and a staff-only ticket opens. Their DMs are relayed in (and kept in the transcript); what staff write goes to their DMs, except lines starting with `//`. Closing tells them.
- Free: 1 panel, 3 topics. Pro: 10 panels of 10 topics, a form of up to 5 questions before a ticket opens, auto-assign to the staff member with the fewest open tickets, and stats.

### Beacon (stream alerts)

- Watches a **Twitch** channel (goes live) or a **YouTube** channel (new video) and posts a card with the thumbnail and a Watch button, optionally pinging one role (never @everyone). Each stream and video is announced once: its ID is swapped in with a conditional update before posting, and a feed's first check only records what's there.
- YouTube uses the channel's public feed (no key). Twitch needs a Twitch app: set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` (dev.twitch.tv/console); without them Twitch alerts stay off and the dashboard says so.
- Twitch is checked every 2 minutes and YouTube every 5, once per watched channel however many servers watch it. Every request has a timeout; provider text is made inert before it's posted.
- Free: 3 alerts with the standard look. Pro: 25, with your own message (`{name}`, `{title}`, `{game}`, `{url}`) and colour. Set up on the dashboard's Alerts page with a live preview.

### Spoils (giveaways)

- Started from the dashboard's Giveaways page: a prize, 1 to 20 winners, 30 minutes to 2 weeks, and a channel. Members press **Enter** (and can leave again); the card's entry count updates within a minute.
- When time's up the minute sweep draws winners with a secure random draw, each entry weighing as much as its entries, and replies to the card naming them (the only pings). A draw is claimed by a conditional update, so it happens once. **Draw now**, **Cancel** and **Draw again** (new winners, never anyone drawn before) are on the dashboard.
- Also from Discord: `/giveaway start`, `end`, `reroll` and `cancel` (Manage Server).
- Free: 2 running at once, open to everyone. Pro: 20, entry rules (a role, or a level from Ranks), up to 3 bonus-entry roles, repeating ("Run again when it ends") and the card's colour.

### Honors (starboard)

- When a message collects the server's emoji (⭐ by default) as many times as it asks (3 by default), Garrison reposts it to the starboard channel: the count, who wrote it and where, their text and first image, and a Jump button. Later reactions update the count. Mentions in the repost never ping.
- The author's own reaction doesn't count unless the server says so; bots' messages, the board itself and ignored channels never reach it; messages from age-restricted channels only go to an age-restricted board.
- Only the message's IDs and its star count are stored, never its text. A repost is claimed before it's posted, so a message reaches the board once.
- Free: everything. Pro: the board's colour and one of the server's own emoji. Set up on the dashboard's Starboard page.
- Role menus and ticket topics can use the server's own emoji on Pro too: type `:name:` on the dashboard.

### Ranks

- **Off by default.** Turn it on with `/ranks settings enabled:true`. Members then earn 15–25 XP for chatting, at most once a minute. The cooldown is enforced in the database, so spam and multiple bot processes can't farm XP. Only who posted and when is used: no message content.
- **`/rank [user]`** posts a rank card image: avatar, name, rank, level and the XP bar. **`/leaderboard`** shows the top 10. Both are open to everyone, one lookup per person every 10 s.
- **Rank cards** are drawn by the bot with `@napi-rs/canvas` and the brand's fonts (bundled from npm, since the container has none), and cached until something on the card changes. On Pro a server picks a background (a preset, or an image uploaded to Discord: the bot fetches images only from Discord's CDN, 4 MB and 5 s at most), an accent colour, up to 4 details members fill in with **`/rankcard`**, and the game accounts members share with the roster. Set it on the dashboard's Ranks page, with a live preview.
- **Voice XP:** a switch in Ranks settings gives 10 XP a minute in voice, only with at least one other person listening, never while deafened or in the AFK channel. It shares the once-a-minute cooldown with messages, so nobody earns twice.
- **XP boosts (Pro):** up to 10 multipliers (×0.5 to ×3) for a role, channel or category, or No XP in places like a bot-commands channel. The biggest that applies counts and No XP always wins. On Free they're kept but not applied.
- **Seasons (Pro):** on the Ranks page, **End this season** keeps the final top 100 (shown there by season), then resets everyone's XP and level so the next season starts even. Reward roles stay. Garrison does it from the dashboard's request queue after re-checking Manage Server and the plan, and posts the top 3 in the level-up channel if there is one.
- **Level-ups** are announced where the member leveled up, in one channel, or not at all, and never ping.
- **Rewards:** `/ranks reward level:10 role:@Veteran` gives a role at a level (`unreward`, `rewards` to manage). Roles with moderation or admin powers, integration roles and roles above Garrison are refused when set _and_ skipped at grant time, so editing a reward role later can't hand out power.
- The dashboard has a Ranks page with the leaderboard and rewards.

### Health

`/health` checks Garrison's permissions per module, its role position (roles with moderation powers above Garrison are anti-nuke's blind spot), the log and alert channels, the verify and staff roles, and whether protections are on. If permissions are wrong, a **Fix permissions** button re-invites Garrison with exactly the set it uses (never Administrator, and it warns if Garrison has it).

### Metrics and status

The bot keeps a few counts, never content: messages per server per UTC day, when each member last posted (throttled to once every 15 minutes), hourly p50/p95 of how fast each command got its first reply, and a heartbeat each minute. `/health` results are saved, and refreshed for every server every 30 minutes. The Overview shows these numbers, and `/status` is a public page with the current state, 30-day uptime and command reply times. Uptime counts from the first heartbeat, so a new install isn't shown as down.

### Intents

`Guilds`, `Guild Moderation` (audit log, for anti-nuke), `Guild Voice States` (Rally), `Guild Messages` (Ranks, tickets), `Guild Message Reactions` (the starboard), `Direct Messages` (modmail), `Guild Invites` (which invite a member used), and two privileged intents: **Server Members** and **Message Content** (ticket transcripts). Turn both on under Bot → Privileged Gateway Intents in the Developer Portal, or login fails with "Used disallowed intents". Past 100 servers, Discord must approve Message Content for the bot.

## Dashboard

`apps/web` serves the public landing page at `/` and the dashboard. The landing page covers the modules, security and early-access pricing, with an **Add to Discord** button that requests exactly the permissions `/health` checks (set `DISCORD_CLIENT_ID`).

The dashboard: Sign in with Discord to see the servers you manage, switch between them from the top bar, search settings, members and cases (⌘K / Ctrl+K), and pick a light or dark theme. An **Overview** (active members, messages today, mod actions, command reply p95, the latest Quartermaster build, saved health checks with a Fix permissions button, open groups, next raid, Gatehouse status, recent cases), **Watch** (the escalation ladder, editable up to five steps, and the latest 50 cases, searchable by member or case number), **Gatehouse** (lockdown, anti-raid and anti-nuke settings) and **Rally** (open groups and raid rosters by role; create a raid, move a player off the bench, or post a call for missing roles, which Garrison then does in Discord) and **Gatehouse** (lock and lift the server, post the Verify button, restore quarantined roles, and owner-only anti-nuke), **Settings**: Watch, Gatehouse anti-raid, staff roles and verification, the raid time zone, Ranks (on or off, where level-ups go) and Ledger (channel, 7 to 365 days of retention), with a history of every change and one-click **Undo**. Anti-nuke and the trusted list stay owner-only commands in Discord, and Ranks rewards stay in `/ranks reward`.

```sh
pnpm --filter @garrison/web dev     # http://localhost:3000
```

Set `APP_URL`, `DISCORD_CLIENT_SECRET` and `WEB_DATABASE_URL` in `.env`, and add `APP_URL/auth/callback` as an OAuth2 redirect in the Developer Portal. See SECURITY.md for how sign-in is protected.

## Deploying

**Fastest: [GO-LIVE.md](GO-LIVE.md)**, a browser-only checklist that deploys to Cloudflare from GitHub Actions. Details and other routes: **[DEPLOY.md](DEPLOY.md)**: Cloudflare (the dashboard as a Worker with Hyperdrive, the bot as one always-on Container), Discord Developer Portal settings, turning on the database roles, a one-server `docker compose` setup with automatic HTTPS, and `pnpm preflight` (or `node dist/preflight.js` in the image), which checks the token, intents, database roles and schema before you go live.

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
