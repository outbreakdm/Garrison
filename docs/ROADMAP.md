# Roadmap: Garrison Pro and the all-in-one bot

The running plan for paid plans (Stripe), deeper customization on every feature, and
the new modules that make Garrison an all-in-one bot. Whoever picks this up next (a
person or a Claude session) starts at **Pick up here**, does the next unchecked step,
then updates **Status** and the **Log** before stopping.

## Pick up here

- **Now:** Phases 1 and 3 to 11, and the follow-ups in the Log, are code done, committed,
  not pushed or deployed. **Before deploying:** apply every migration from `0023_role_menus`
  through `0040_web_verify` to production (`DATABASE_MIGRATION_URL` set,
  `pnpm db:migrate`, see DEPLOY.md); the bot preflight checks for their tables, so a deploy
  before them stops at
  preflight. **Message Content Intent must be on** in the Developer Portal (Bot → Privileged
  Gateway Intents): the bot now asks for it, and login fails without it.
  After deploying: post a menu on a test server and press its buttons (the one part not
  checked locally, since no bot runs in the local preview), change Garrison's nickname
  from Settings, turn on a welcome card and join on a test account, and schedule a message
  a few minutes ahead, then post a ticket panel, open a ticket on a test account, write in it,
  claim and close it, and read its transcript on the dashboard. Garrison's invite now asks for
  Change Nickname, so existing servers see it in /health until they re-invite or tick it on
  Garrison's role. Check `/rank` draws its image on the real host (the canvas module's Alpine
  binary). For Twitch alerts, create a Twitch app (dev.twitch.tv/console) and add
  `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` as GitHub secrets (the deploy passes them on);
  YouTube alerts need no key. Then start a giveaway and star a message on a test server. Next:
  Phase 2 (Stripe) once a price is set, then the depth backlog.
- **Branch:** `dashboard-first` (everything up to commit `1aed992` is deployed). Later
  commits (roadmap, plan list, staff and comps) are committed but not pushed or deployed.
- **Before pushing:** `pnpm -r exec tsc --noEmit`, `pnpm test`, `pnpm exec biome check apps packages`.
- **Deploying:** "deploy" means commit, push, then
  `gh workflow run deploy-cloudflare.yml --repo outbreakdm/Garrison --ref <branch> -f target=everything -f register_commands=true`.
- **Never commit** `.env*`, `.claude/launch.json`, `.claude/skills/impeccable`, real Discord IDs,
  tokens or names. The repo is public: the owner's Discord ID lives in a secret, not here.

## Status

| Phase | What | State |
|---|---|---|
| 0 | This roadmap | **Done** |
| 1 | Plans foundation: one feature list, one entitlement check, owner bypass, comps, Plan page | **Done**: migration 0022 and the staff row are in production; code not deployed yet |
| 2 | Stripe in test mode: Checkout, customer portal, webhook, then live keys | Not started |
| 3 | Shared card editor (field editor + live preview + Pro-locked styling) | **Done** (not deployed) |
| 4 | Role menus (first module on the card editor) | **Code done**, not deployed: needs migration 0023 |
| 5 | Bot profile per server (name, avatar, banner, bio, card colours) | **Code done** (not deployed); card colour and footer defaults moved to later |
| 6 | Welcome (messages, leave messages, roles on join) | **Code done**, not deployed: needs migration 0024 |
| 7 | Tickets / modmail | **Code done**, not deployed: needs migration 0026 and the Message Content intent |
| 8 | Message builder (post now or on a schedule) | **Code done**, not deployed: needs migration 0025 |
| 9 | Custom rank cards with character details | **Code done**, not deployed: needs migration 0028 |
| 10 | Stream and video alerts (Twitch, YouTube, Kick) | **Code done**, not deployed: needs migration 0029; Twitch needs the owner's keys; Kick later |
| 11 | Giveaways and starboard | **Code done**, not deployed: needs migrations 0030 and 0031 |
| — | Depth for current modules (backlog below), slotted between phases | Not started |

## How plans work

**Per server.** One subscription upgrades one server, matching the existing `guild_plans`
table (`free` | `pro`, no row means free). A bundle for owners of several servers can come later.

**The paywall rule.** Everything a server needs to stay safe is free (the product brief
promises it). Every feature works fully on Free with the standard look and sensible
limits. Pro sells **deeper customization, branding, scale and history**, never safety.

**The pattern every feature follows:**

- Free: the full feature, a ready-made template, every field editable, a live preview.
- Pro: styling and branding (accent colour, images, thumbnails, banners, custom emoji,
  removing the Garrison footer), higher limits, history and exports, automation (schedules,
  conditions).
- Locked controls are visible on Free with a Pro tag. The preview shows the Pro look so
  people can try it, but saving a Pro-only value is refused with a plain message.
- Downgrading never deletes anything. Whatever is over the Free limit pauses (read-only,
  not posted, not run) and comes back when the server re-subscribes.

**One feature list.** Every gated thing is a key in `packages/db/src/plans.ts` with its
Free value, Pro value and a one-line description. The bot, the dashboard, the landing
page's pricing table and the staff page all read it. If it isn't in that list, it isn't
paywalled. A test fails if code checks a key that isn't in the list.

**One check.** `entitlements(plan, { staff })` answers what a server can do. A staff
member (the owner bypass) gets Pro limits everywhere.

### Free vs Pro, feature by feature (draft: tune before Stripe goes live)

| Feature | Free | Pro |
|---|---|---|
| Bot profile per server | Nickname | Avatar, banner and bio in this server; accent colour on every card; footer without "Garrison" |
| Role menus | 3 menus, buttons or dropdown, template editor with live preview | Unlimited menus, accent colour, images and banners, custom emoji, max picks, required roles, temporary roles |
| Welcome | Text welcome and leave messages, 1 role on join | Image welcome cards, colours, DM welcome, roles on join by condition |
| Tickets / modmail | 1 panel, 3 categories, claim, close, transcripts kept 30 days | Many panels, forms before opening, auto-assign, transcripts 365 days, branding, ticket stats |
| Message builder | Post cards with the standard look, 3 scheduled | Colours, images, link buttons, repeating schedules, 50 scheduled |
| Stream and video alerts | 3 feeds | 25 feeds, custom message and colour |
| Giveaways and starboard | Basic giveaways, starboard | Entry requirements (role, level), bonus entries, custom look |
| Ranks | XP, levels, rewards, default rank card, voice XP | Custom rank cards (background, colours, character details), XP boosts by role or channel, seasons |
| Rally | 3 templates (exists) | 25 templates, notify a role (exists), custom card colour |
| Ops | 25 scheduled raids, calendar view, calendar feed, web signup | Attendance history and reliability, custom card colour, more raids |
| Watch (safety) | Everything: cases, undo, escalation, automod, mod notes, appeals, temporary bans | Bigger automod word lists and per-channel rules, appeal form branding |
| Gatehouse (safety) | Everything: anti-raid, anti-nuke, verification, web captcha, alt warnings, 1 manual backup | Scheduled backups, 30 backups kept |
| Ledger | 30 days, invite tracking, voice and nickname events | Up to 365 days, CSV export |
| Barracks | Link accounts, roster | Roles that follow game stats |
| Quartermaster | 5 builds an hour (exists) | 20 builds an hour, server templates |

**Custom rank cards (Pro).** Players fill in character details on their own card: in-game
name, class or main, server/realm, a short bio, and anything linked in Barracks (OSRS
stats, WoW characters). The server picks which fields exist; players fill them on the
dashboard (or with `/rank edit`). Rendered as an image, cached, regenerated on change.

**Bot profile per server (Pro).** Discord lets a bot set its own nickname in a server, and
(added 2025) a per-server avatar, banner and bio through Modify Current Member
(`PATCH /guilds/{id}/members/@me`). Confirm the fields in Discord's docs when building.
Card accent colour and footer text come from the same settings, read by `lib/card.ts`.

### Owner bypass (staff)

- Not a Discord role: roles belong to each server and any admin can make one called
  "Owner". Staff are Discord user IDs in the `platform_staff` table, which only the
  database owner can write. **One-time setup (owner):** in the Supabase SQL editor run
  `INSERT INTO platform_staff (user_id) VALUES ('<your Discord user ID>');`
  (migration `0022_plans_comps` must be applied first).
- Plans belong to servers, not people, so the bot and dashboard always agree. The bypass is
  staff giving any server Pro for free (a "complimentary" plan, recorded with who gave it
  and why) through `plan_set_comp()`, which refuses non-staff and never touches a paid plan.
- A staff-only admin page lists every server's plan, subscription status and comps.
  Every bypass and comp is logged.

### Stripe (phase 2)

- Each server gets a **Plan** page on the dashboard: what's included, what's locked, Upgrade.
- Upgrade opens **Stripe Checkout** (subscription mode) with the server's ID in metadata.
  The **customer portal** handles card changes, cancelling and invoices.
- A **webhook** on the dashboard writes `guild_plans`. Events: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- New columns: Stripe customer ID, subscription ID, status, current period end, cancel at
  period end, paid by (user ID), source (`stripe` | `comp`).
- Failed payment: keep Pro through Stripe's retry window, then drop to Free.
- Cloudflare Workers: use Stripe's fetch HTTP client and the async webhook signature check.
  Only the database owner can write `guild_plans` (RLS), so the webhook needs its own
  database credential (billing role) as a new secret.
- Test mode end to end first. The Stripe plugin needs authorizing (`/mcp`) to create
  products and prices from Claude; writing the code doesn't need it.

## Phase checklists

### Phase 1: plans foundation

- [x] `packages/db/src/plans.ts`: the feature list (Free value, Pro value, description) and
      `entitlements()`. Rally's `PLAN_LIMITS` is now derived from it (callers unchanged).
- [x] Test (`plans.test.ts`): Free never exceeds Pro, Rally stays in step, staff get Pro.
      Keys used in code are checked by TypeScript (`FeatureKey`).
- [x] Staff and comps in the database (migration `0022_plans_comps`): `platform_staff`,
      `guild_plans.source` (`stripe` | `comp`), `granted_by`, `note`, and
      `plan_set_comp(actor, guild, comp, why)`. Repo: `isStaff`, `setComp`, `getPlanDetails`,
      `listServerPlans` in `packages/db/src/repo/plans.ts`, tested against RLS.
      (Replaced the earlier env-secret idea: a personal bypass can't apply to things the
      bot does later with nobody acting, so the bypass is server-level.)
- [x] Apply migration `0022_plans_comps` to production and add the owner's row to
      `platform_staff` (done by the owner, checked 2026-11-11).
- [x] Dashboard **Plan** page per server (`/servers/:id/plan`, in the nav after Settings):
      current plan, the Free vs Pro table from `FEATURES`, and for staff a "Give this server
      Pro for free" / "Put back on Free" form (`plan/actions.ts`, re-checks access and staff).
      Checked in the local preview at desktop and phone width (no sideways scroll).
- [x] Staff page (`/staff`, 404 for everyone else): every server's plan with paid/free-Pro
      counts, and Give Pro free / Put back on Free per server. Staff see a link to it on the
      server picker. Checked in the local preview.

### Phase 3: shared card editor

- [x] Dashboard component (`apps/web/components/cards/`): `CardEditor` edits title, text
      blocks and dividers (reorder, remove), accent colour, thumbnail, banner image and
      footer; `CardPreview` draws it like Discord (dark theme, accent bar, heading, Discord
      markdown, mentions by name, image, the module's buttons or dropdown, footer). Styles in
      `app/cards.css`. Side by side with a sticky preview on desktop, preview first on phones.
- [x] Pro-locked controls: Pro tag on Free, still usable so the preview shows the look;
      `ProNotice` explains and offers "Use the standard look". Saving is refused on the server
      (`lockedCardFields`); values already saved survive a downgrade, and the bot draws the
      standard look meanwhile (`cardForPlan`). Plan keys: `cards.accent`, `cards.images`,
      `cards.footer`.
- [x] One saved shape: `CustomCard` in `packages/db/src/cards.ts` (browser-safe import
      `@garrison/db/cards`), parsed by `parseCard` on both sides. The bot draws it with
      `customCardMessage` in `lib/card.ts`. Decision: the bot's own system `Card` type stays in
      the bot, because it holds discord.js button builders; designed cards are plain data.
- [x] Tests: `cards.test.ts`, bot `card.test.ts` (Pro and Free look), the preview's markdown
      (`components/cards/markdown.test.tsx`, including that typed text can't become markup).
- Limits: the dashboard's CSP only loads images from Discord's CDN, so other image links show
  a marked stand-in with the host in the preview (Discord itself loads them). Image upload
  (R2) would remove that; not planned yet.

### Phase 4: role menus (module "Insignia", plain label "Role menus")

- [x] Rules, shared by bot and dashboard (`packages/db/src/role-menus.ts`): a menu is a
      `CustomCard` plus buttons (up to 15) or a dropdown (up to 25), one standard emoji per
      role, "any number" or "just one" picks on Free; "up to N" picks and a needed role on Pro
      (`roles.limits`). Free runs 3 menus, Pro 25 (`roles.menus`). Over the limit after a
      downgrade, the last menus pause (saved, buttons answer "paused"); nothing is deleted.
      Limits a Pro server set keep applying after a downgrade: access never loosens.
- [x] Storage (migration `0023_role_menus`): `role_menu_settings` (the menu list, edited by
      the dashboard with Settings history and undo, read by the bot) and `role_menu_posts`
      (where each menu is posted, written only by the bot). New request kind
      `post_role_menu`. Tested under each role's grants.
- [x] Bot (`apps/bot/src/modules/roles/`): posts or updates the menu (posting elsewhere
      moves it and deletes the old message), buttons toggle a role, the dropdown sets the
      member's roles from that menu, "just one" swaps. Every click is checked against the
      menu as saved now; a role is never handed out if it's @everyone, managed, has
      moderation or admin powers, or sits above Garrison. Answers are private cards.
      Dropdowns are routed through a new `SelectHandler` registry.
- [x] Dashboard (`/servers/:id/insignia`, nav "Insignia · Role menus"): starting points
      (Notifications, Games, Name colour, blank), the card editor plus roles, picks and who
      can use it, the live preview with the real buttons or dropdown, Save (blocked in the
      browser when the server would refuse, so edits are never lost), Post/Update/Move in a
      channel (only the saved menu, never unsaved edits), Remove (undoable). Roles a menu
      can't give are left out of the picker; roles above Garrison are marked with how to fix.
      Search, Overview links, Settings history ("Role menus: Added Games") and the Settings
      map know about it.
- [x] Checked in the local preview (desktop, phone, light theme; no sideways scroll):
      add, edit, Pro refusal and undo, save, queue a post, history. Not checked: the bot
      posting and answering clicks against real Discord.
- Later: server (custom) emoji on Pro, temporary roles on Pro, button colours, the landing
  page still says "Eight modules" (Insignia makes nine; copy change for the owner to approve).

### Phase 5: bot profile per server

- [x] Checked Discord's docs: `PATCH /guilds/{id}/members/@me` takes `nick`, `avatar`,
      `banner` (base64 data URIs) and `bio`. Nickname needs Change Nickname, now in the invite
      and `/health` (Profile row).
- [x] Rules (`packages/db/src/profile.ts`, browser-safe): nickname on Free; avatar, banner and
      bio on Pro (`profile.identity`); putting any part back to Garrison's own is always
      allowed. Images are PNG, JPEG or GIF data URIs up to 400 KB, resized in the browser
      (avatar 256 px square, banner 960 × 384).
- [x] Request kind `bot_profile` (added to migration 0023, so there's still one migration
      to apply). Only the fields that changed are sent; the bot checks the plan again and
      applies them. Request lists leave image data out of what pages load.
- [x] Dashboard: Settings → "Garrison in this server", with a live Discord profile card
      (banner, avatar, name, App tag, bio). Discord doesn't share a member's bio, so the bio
      field says it replaces what's there. Checked in the local preview (Free refusal, a
      nickname-only request queued, phone width).
- No settings history for the profile: Discord holds it, and undo is "Garrison's own" per
  part. Image data stays in that request's row; prune old image payloads later.
- Later: server-wide card accent colour and footer defaults (they must never recolour
  moderation and alert cards, whose colours report state).

### Phase 6: welcome (module "Herald", plain label "Welcome")

- [x] Rules (`packages/db/src/welcome.ts`, browser-safe): a welcome card in a channel, a leave
      card, a welcome DM (Pro, `welcome.dm`), and roles on join (1 on Free, 5 on Pro,
      `welcome.roles`). Placeholders `{user}` (mentions them; the only ping a welcome makes),
      `{name}`, `{server}`, `{count}`; on the leave card `{user}` becomes their name. Saved Pro
      values survive a downgrade and pause.
- [x] Storage: migration `0024_welcome`, `welcome_settings` (one row, per-field Settings
      history and undo; the bot only reads).
- [x] Bot (`apps/bot/src/modules/welcome/`): runs after Gatehouse has judged the join; nothing
      is posted or given during a raid or an active lockdown; at most 10 cards a minute per
      server; roles on join skip anything @everyone, managed, powerful or above Garrison;
      closed DMs are skipped quietly; bots are ignored.
- [x] Dashboard (`/servers/:id/herald`, nav "Herald · Welcome"): welcome card, roles on join,
      leave card and welcome DM, each a panel with the card editor and a preview filled as if
      you had just joined. Settings history reads "Roles on join: none → @Raiders". Checked
      in the local preview (save, Pro refusal of the DM, roles, phone width).
- Later: image welcome cards with the member's avatar (needs rendering), roles on join by
  condition (Pro), and checking real joins against a live server after deploy.

### Phase 7: tickets (module "Parley", plain label "Tickets")

- [x] Decision (owner, 2026-11-12): store message content. Garrison now requests the Message
      Content intent (preflight fails without it). Message text is stored only in ticket
      transcripts so far; the landing page, README and SECURITY.md say so.
- [x] Rules (`packages/db/src/tickets.ts`, browser-safe): a panel is a `CustomCard` plus topics
      (one button each). Free: 1 panel, 3 topics (`tickets.panels`, `tickets.topics`); Pro: 10
      of 10, a form of up to 5 questions before a ticket opens (`tickets.forms`), auto-assign
      (`tickets.autoAssign`), stats (`tickets.stats`). Transcripts kept 30 or 365 days after
      closing (`tickets.historyDays`). Saved Pro values pause on Free; nothing is deleted.
- [x] Storage (migration `0026_tickets`): `ticket_settings` (one row, Settings history and
      undo), `ticket_panel_posts`, `tickets` (numbered per server, never reused),
      `ticket_messages` (the transcript, with edits and deletions marked) and `ticket_notes`
      (dashboard only). The bot can delete a ticket only once its expiry has passed, and the
      transcript and notes go with it. Tested under each role's grants.
- [x] Bot (`apps/bot/src/modules/tickets/`): a press opens `ticket-0042` under the chosen
      category, visible to the member, the staff roles and Garrison only; the opening card
      pings the member (and the staff roles if wanted); Claim and Close buttons; `/ticket close
      | claim | add | remove`. Every press is checked against the setup as saved now. Closing
      sets the expiry from the plan, posts a summary to the log channel, and deletes the
      channel 10 s later (the sweep retries if a restart got in the way). A ticket channel
      deleted by hand closes its ticket.
- [x] Dashboard (`/servers/:id/parley`, nav "Parley · Tickets"): the queue (waiting on staff,
      waiting on the member, unclaimed, closed, all), search by number, member or transcript
      text, Pro stats (opened, closed, median first reply), who handles tickets, and panels on
      the card editor with Post/Update/Move. Each ticket's page has the transcript, the form
      answers, staff notes, and Claim and Close. Checked in the local preview (desktop and
      phone, no sideways scroll): add, Pro refusal of a form and undo, save, setup, queue a
      post, add a note, queue a claim.
- Later: modmail (opening a ticket by DMing Garrison), reopening a closed ticket, transcripts
  as a downloadable file, ticket search in the top search box.

### Phase 9: rank cards

- [x] Decision (owner, 2026-11-12): add an image-rendering library. `@napi-rs/canvas` (prebuilt,
      including Alpine/musl) plus the brand fonts from `@expo-google-fonts/*` (TTF files; the
      container has no fonts).
- [x] Rules (`packages/db/src/rank-cards.ts`, browser-safe): the standard card is free; Pro
      (`ranks.cards`) picks a background (6 presets, or an image on Discord's CDN), an accent
      colour, up to 4 details members fill in, and shared game accounts. Saved Pro looks pause on
      Free. Stored in `ranks_settings.card` (Settings history and undo); members' answers in
      `rank_profiles` (migration `0028_rank_cards`), written by the bot only.
- [x] Bot: `/rank` posts the card as a PNG (`modules/ranks/render.ts`), falling back to the
      text card if drawing fails; images only from Discord's CDN, capped at 4 MB and 5 s; cards
      cached (200) by everything drawn on them. `/rankcard` opens a form with the server's
      details. Game accounts show only if the member shares them with this server's roster.
- [x] Dashboard: Ranks → Rank card, with presets, image link, accent, details and a live
      preview drawn to the image's proportions. Checked in the local preview (Free refusal,
      Pro save, paused on Free, history, phone width) and the drawn PNGs by eye.
- Later: members filling details on the dashboard, a season badge, uploading a background
  instead of pasting a Discord link.

### Phase 10: stream alerts (module "Beacon", plain label "Alerts")

- [x] Rules (`packages/db/src/alerts.ts`, browser-safe): a feed watches a Twitch login or a
      YouTube channel (ID or @handle, from a name or a link), posts in one channel and may ping
      one role. Free 3 feeds (`alerts.feeds`), Pro 25 with your own message and colour
      (`alerts.custom`); extras pause on Free.
- [x] Storage (migration `0029_alerts`): `alert_settings` (the list, Settings history and undo)
      and `alert_state` (what the bot last saw and posted; the dashboard reads it for "Live now",
      "Last alert", "Waiting for Garrison's Twitch keys", "Channel not found").
- [x] Bot (`apps/bot/src/modules/alerts/`): Twitch Helix with a client-credentials token,
      YouTube's public channel feed (no key; @handles resolved once from the channel page).
      Each item is claimed with a conditional update before posting, so it's announced once;
      a first check records without posting; videos older than a day aren't announced.
      `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are optional secrets, passed through the
      Cloudflare Worker and the deploy workflow; preflight says whether Twitch is on.
- [x] Dashboard (`/servers/:id/beacon`, nav "Beacon · Alerts"): add a feed, edit where it posts,
      the ping and (Pro) the message and colour with a live preview, each feed's status.
      Checked in the local preview (add from links, Pro refusal, statuses, phone width).
- Later: Kick (its public API needs an app review), YouTube live streams (needs the YouTube
  Data API key), a "send a test alert" button.

### Phase 11: giveaways (module "Spoils", plain label "Giveaways") and starboard

- [x] Giveaway rules (`packages/db/src/giveaways.ts`): prize, 1 to 20 winners, set lengths from 30
      minutes to 2 weeks. Free 2 running (`giveaways.running`), Pro 20 with entry rules, bonus
      entries and colour (`giveaways.rules`). Weighted draw without repeats, tested for fairness.
- [x] Storage (migration `0030_giveaways`): `giveaways` and `giveaway_entries`, written by the bot
      only; the dashboard asks through `start_giveaway` and `giveaway_action` requests.
- [x] Bot (`apps/bot/src/modules/giveaways/`): posts the card, Enter and Leave (rules checked on
      every press), the minute sweep draws what's due (claimed once) and keeps entry counts
      current, Draw now / Cancel / Draw again from the dashboard.
- [x] Dashboard (`/servers/:id/spoils`, nav "Spoils · Giveaways"): start one (Pro rules shown
      locked on Free), recent giveaways with entries, winners by name and their actions. Checked
      in the local preview (the form, the queued request's payload, the list).
- [x] Starboard (module "Honors", plain label "Starboard"): rules in
      `packages/db/src/starboard.ts` (one emoji, 1 to 50 reactions, the author's own star off by
      default, ignored channels, Pro colour `starboard.look`); migration `0031_starboard`
      (`starboard_settings` with history, `starboard_posts` with IDs and counts only, claimed
      before reposting and released if the post fails); the bot listens to reactions (new
      intent `GuildMessageReactions`, not privileged) and reposts with the text, first image and
      a jump link, never pinging; age-restricted messages only go to an age-restricted board.
      Dashboard `/servers/:id/honors`. Checked in the local preview (save, phone width).
- Later: custom server emoji for the starboard, a giveaway command in Discord, giveaways that
  repeat.

### Phase 8: message builder (module "Dispatch", plain label "Messages")

- [x] Rules (`packages/db/src/messages.ts`, browser-safe): saved messages (up to 50) are a
      card, up to 5 link buttons (Pro, `messages.extras`), a channel and a schedule: once,
      daily or weekly (repeats are Pro). Free schedules 3, Pro 50 (`messages.scheduled`);
      extra schedules pause after a downgrade, saved repeats and buttons pause too.
      Times are wall-clock times in the server's time zone (Settings → Server), so weekly
      sends keep their hour across daylight saving (tested). A send missed by over an hour
      (bot offline) is skipped, not sent late.
- [x] Storage: migration `0025_messages`: `message_settings` (the list, Settings history and
      undo) and `message_sends` (written by the bot; each send is claimed before posting, so
      nothing goes out twice). Request kind `post_message` for "Post now".
- [x] Bot (`apps/bot/src/modules/dispatch/`): the minute sweep posts what's due; "Post now"
      checks the requester can post in the channel.
- [x] Dashboard (`/servers/:id/dispatch`, nav "Dispatch · Messages"): starting points
      (Announcement, Rules, Weekly reminder, blank), the card editor, link buttons, where and
      when, next and last send, Post now. Checked in the local preview.
- Later: role pings on a scheduled message (needs a mention-safe design), editing a message
  already posted, a calendar of upcoming sends.

Later phases get their checklists when they start.

## Depth for current modules (backlog)

- **Watch:** [x] automod (spam, invite links, mass mentions, word lists; AI moderation on Pro) · [x] mod notes on
  members · [x] appeals form on the dashboard feeding a queue · [x] temporary bans that lift
  themselves
- **Gatehouse:** [x] captcha verification on the website · [ ] alt-account warning signs ·
  [ ] full server backup and restore (channels, roles, permissions)
- **Ledger:** [ ] invite tracking · [ ] voice joins and leaves · [ ] nickname changes ·
  [ ] CSV export · [x] the text of deleted and edited messages (off by default, a switch in
  Ledger settings; migration `0027_ledger_text`; only for messages Garrison saw since its last
  restart, capped at 1,500 characters, removed with the event)
- **Rally:** [ ] LFG board on the dashboard for players · [ ] no-show tracking ·
  [ ] squads that repeat
- **Ops:** [ ] calendar view · [ ] calendar feed (ICS) · [ ] attendance history per member ·
  [ ] signing up from the web
- **Ranks:** [ ] XP for time in voice · [ ] XP boosts by role or channel · [ ] seasons ·
  [ ] custom rank cards (phase 9)
- **Barracks:** [ ] more game accounts · [ ] roles that follow game stats
- **Quartermaster:** [ ] server templates that copy a layout · [ ] scheduled backups (shares
  the Gatehouse backup engine)

## New modules (in build order)

1. **Role menus:** members pick roles with buttons or a dropdown. Basic template, every
   field editable, live preview; Pro unlocks styling and rules (table above).
2. **Welcome:** welcome and leave messages, roles on join, works with verification.
3. **Tickets / modmail:** private support threads with transcripts on the dashboard. Must
   feel in-depth yet easy: a setup wizard (panel, categories, staff roles, where tickets go),
   a live queue (open, waiting on staff, waiting on member, closed), claim and assign,
   internal notes, transcripts searchable on the dashboard, and per-ticket history.
4. **Message builder:** design cards on the dashboard (the card editor), post now or on a
   schedule, for announcements and rules.
5. **Stream and video alerts:** Twitch, YouTube, Kick live and upload notifications.
6. **Giveaways and starboard.**

## Open decisions for the owner

- **Price** for Pro per server (Dyno and Carl-bot sit around $5 a month). The structure is
  set (per server, the table above); the amount isn't recorded anywhere yet.

Decided (2026-11-12, owner):

- **Message content:** store it, and change the promise. Tickets keep transcripts; Ledger's
  deleted and edited message text and the starboard come next. Discord must approve the
  Message Content intent once Garrison is in 100 servers.
- **Free backups:** one manual backup on Free is enough.
- **Rank cards:** an image-rendering library may be added to the bot.
- **Stream alerts:** build them; the owner creates the Twitch and YouTube keys.
- **Module names** Insignia, Herald, Dispatch (and Parley) stay; the landing page counts modules
  from the module list.

## Log

- 2026-11-11: Roadmap written. Discord messages moved to Components V2 and deployed
  (commit `1aed992`). Phase 1 started.
- 2026-11-11: Plan feature list (`packages/db/src/plans.ts`) and tests added; Rally reads its
  limits from it. Type-check, all tests and Biome pass. Committed `6504bbf`.
- 2026-11-11: Staff and complimentary plans in the database (migration 0022, repo, tests).
  Committed `2a3141d`.
- 2026-11-11: Plan page on the dashboard with the staff comp form. Type-check, 344 tests and
  Biome pass. Committed `fa468d2`; phone-width table fix after it.
- 2026-11-11: Staff page and staff link on the server picker. All checks pass. Phase 1 code done.
- 2026-11-12: Phase 3 done: shared card shape, bot renderer, card editor and Discord preview,
  checked in the local preview at desktop and phone width (no sideways scroll) and with the
  impeccable detector (only findings are Discord's own anatomy inside the preview).
  Committed `2c421a5`.
- 2026-11-12: Phase 4 code done: role menus (rules, migration 0023, bot posting and clicks,
  dashboard page). Type-check, 365 tests and Biome pass; checked in the local preview.
  Committed `bdc94ad`.
- 2026-11-12: Phase 5 code done: Garrison's nickname, avatar, banner and bio per server.
  Type-check, 368 tests and Biome pass; checked in the local preview. Committed `cf6d1a1`.
- 2026-11-12: Phase 6 code done: Welcome (join, leave and DM cards, roles on join), migration
  0024. Type-check, 373 tests and Biome pass; checked in the local preview. Committed
  `4c08fe0`, plus a warning when roles on join could get ahead of verification (`560bb43`).
- 2026-11-12: Phase 7 skipped pending the message-content decision. Phase 8 code done:
  message builder with schedules, migration 0025. Type-check, 380 tests and Biome pass;
  checked in the local preview.
- 2026-11-12: Code review of everything since `1842f71`, all ten findings fixed: a failed
  scheduled or "Post now" send gives its claim back so it's retried (migration 0025 lets the
  bot delete only unsent claims); the sweep reads only servers with schedules; welcomes wait
  out the anti-raid window so the first raiders of a burst get no roles; welcome settings
  are cached 30 s; Change Nickname missing is a /health warning, not a fix; the preview's
  timestamps are drawn in UTC (no hydration mismatch); editors remount when what they edit
  changes; one flash helper (`lib/flash.ts`) and one ID generator (`ids.ts`).
- 2026-11-12: Owner decisions recorded (Open decisions). Phase 7 code done: tickets with
  transcripts, migration 0026, Message Content intent requested, the site's message-content
  promise and module count updated. Type-check, 390 tests and Biome pass; checked in the local
  preview. Committed `28c3151`.
- 2026-11-12: Ledger keeps the text of deleted and edited messages when a server turns it on
  (migration 0027); the site's copy says so. Type-check, 392 tests and Biome pass; checked in
  the local preview. Committed `8f66ecc`.
- 2026-11-12: Phase 9 code done: rank cards drawn as images, Pro styling and details,
  `/rankcard`, migration 0028. Type-check, 399 tests and Biome pass; checked in the local preview.
  Committed `a2c5bb5`.
- 2026-11-12: Phase 10 code done: Twitch and YouTube alerts, migration 0029. YouTube works
  without a key; Twitch waits on the owner's Twitch app keys. Type-check, 407 tests and Biome pass;
  checked in the local preview. Committed `a93f4e9`.
- 2026-11-12: Phase 11 code done: giveaways (`f5afbf2`, migration 0030) and the starboard
  (migration 0031). Type-check, 419 tests and Biome pass; checked in the local preview.
  Committed `99d3c4d`.
- 2026-11-12: Review pass over this session's work (ticket open/close races, alert
  de-duplication, giveaway draws, starboard claims, the new partials). One fix: "Draw again"
  now skips everyone drawn before, not just the last draw (migration 0032).
- 2026-11-12: Follow-ups: a ticket's transcript downloads as a text file; a closed ticket can be
  reopened from the dashboard in a new channel (migration 0033).
- 2026-11-12: Follow-up: "Send a test alert" on each alert posts a sample in its channel without
  the ping (migration 0034).
- 2026-11-12: Follow-ups: `/giveaway start | end | reroll | cancel` in Discord (Manage Server),
  and repeating giveaways on Pro: "Run again when it ends" (migration 0035).
- 2026-11-12: Follow-up: server emoji (Pro, `emoji.custom`) in role menus, ticket topics and the
  starboard. Type :name: on the dashboard; previews draw the emoji; each must be this server's.
- 2026-11-12: Follow-ups: a welcome image on Pro (the new member's avatar, name and number, drawn
  by the bot; Welcome → Welcome image), and members filling their rank card details on their
  Account page as well as with /rankcard (migration 0036). Next: modmail by DM, then the
  depth backlog from the top (Watch).
- 2026-11-12: Follow-up: modmail. Members DM Garrison, pick the server, and a staff-only ticket
  opens; messages are relayed both ways (`//` keeps a staff line internal). New intent
  `DirectMessages` (not privileged). Migration 0037. All follow-ups are done except Kick alerts
  and YouTube live (both need keys or an app review) and uploading backgrounds (needs storage).
- 2026-11-12: Backlog: temporary bans (`/ban length:` and the dashboard), lifted by the minute sweep.
- 2026-11-12: Backlog: staff notes (/note and the member page) and appeals (public page per server,
  queue on Watch, accept can undo the case), migration 0038.
- 2026-11-12: Backlog: automod (words, invites, mentions, spam; delete, warn or time out) and, at the
  owner's request, AI moderation on Pro through OpenAI's free moderation model (needs
  `OPENAI_API_KEY`; self-harm only alerts staff). Migration 0039.
- 2026-11-12: Backlog: verification on the website (sign in with Discord, optional Turnstile captcha
  via `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET`); the bot now gets `APP_URL` for its links.
  Migration 0040.
