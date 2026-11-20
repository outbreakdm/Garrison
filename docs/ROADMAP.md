# Roadmap: Garrison Pro and the all-in-one bot

The running plan for paid plans (Stripe), deeper customization on every feature, and
the new modules that make Garrison an all-in-one bot. Whoever picks this up next (a
person or a Claude session) starts at **Pick up here**, does the next unchecked step,
then updates **Status** and the **Log** before stopping.

## Pick up here

- **AI assistant v2 (planned 2026-11-19), next up:** `docs/AI_ASSISTANT.md`, "Assistant v2". Owner chose Haiku (Fast) and Sonnet (Smart, Pro and Agency only), supplies at each model's real cost, every coverage gap (writing, more modules, insight, how-to help), and a "Your server" workspace with hand edits (rename, drag to reorder) and an Apply build button. Phase 1 first: a message's hold assumes 12,000 input tokens a round but nothing enforces it, so a big server can cost more than it held. **Phases 1 to 8A built** (not deployed; migrations 0076 to 0079). The eval has never run on the real models: it needs `ANTHROPIC_API_KEY` and the owner's yes (about $6.20 for both models, 3 runs). Phases 5 to 8A (how-to help, server insight, writing, more settings and forum and announcement channels) are done too; 8B is built too (role menus, ticket panels, stream alerts, giveaways, the economy and shop, LFG templates, invite labels, server stats counters). **Deployed 2026-11-19** (`9c003e1`, run #54, migrations 0076 to 0079). What's left needs the owner: the first real-model eval run.
- **Landing refresh and Needs attention (2026-11-20), deployed** (`db83944`, run #62, dashboard): hero buttons are Add to
  Discord, Open dashboard, See it in action (now to "Watch it work"); Watch it work opens with a
  new AI assistant clip, then Write it, Fix what needs you, It saves itself. All four clips and
  every landing mockup now show today's real UI (the clips are built from the dashboard's own
  DOM and CSS). Needs attention links straight to each fix and was restyled.
- **Your account (2026-11-20), not deployed:** `/account` is the person's own settings in four
  tabs: Game accounts, Servers (what each server sees, Your space, Stop sharing, rank card
  details), Billing (Agency seats with Manage billing, Pro plans they pay for) and Privacy
  (sign-ins with "Sign out everywhere else", Download your data as JSON, What Garrison keeps,
  Erase your data). Removing a link now wipes its name and details. The member's You page shows
  "Your game accounts here". No migration. The Privacy Policy still says data requests go by
  email; adding the self-serve download and erase to it is the owner's call.
- **Optimize and polish (2026-11-17):** 15 fewer database queries on every dashboard page (the
  menu's module settings in one query), faster AI assistant paint, no layout shift on Settings,
  24 px targets, unused CSS removed (see the Log). To run the Worker beside the database, set the
  GitHub variable `CF_PLACEMENT_REGION` to `aws:us-west-2` (GO-LIVE.md); without it, Smart
  Placement.
- **Layout (2026-11-17), deployed** (`9674d94`, run 44149308218): `docs/LAYOUT_PROPOSAL.md`, every
  recommendation accepted. All four phases: A (`b5a5996`), B (`356e9cc`), C (`0a4fe77`),
  D (`3d4393f`), and a last pass for what the proposal asked that those had left out. No
  migration.
  - A: the menu scrolls on its own (server card and plan card stay put), Needs you is one strip
    under the page head, fields sized to what they hold, repeating rows show one spare with Add.
  - B: page tabs (`components/PageTabs.tsx`) on Moderation, Security, Settings, Welcome,
    Leveling, Tickets, Groups and raids (LFG templates is its Templates tab; the old address
    redirects), Economy, Logs and Game accounts. Every tab is on the page and only shown or
    hidden, so a module's head switch and its form keep working; `?tab=` is the address, and a
    `#section` link opens its tab. Templates in `components/PageLayouts.tsx`: Activity, Setup
    (with "On this page" and save dots from 1280px), Compact. Your account left Settings (it's
    in the top bar).
  - C: Starboard, Suggestions, Voice rooms and Invites on Compact (settings 60%, the live list
    40%, the list first on phones when it has items); Server stats says its problem once. Role
    menus, Messages, Stream alerts and Ticket panels: a tile links to `?edit=<id>`, where the
    editor stands alone at full width with "All role menus" back to the tile
    (`components/Library.tsx`); only that editor is rendered. Fifteen intros cut to one sentence,
    the rest under "How this works" (`components/HowItWorks.tsx`, hidden on phones with the
    intro). The page head is one rule (three layers merged, computed styles unchanged on 8 pages
    in both themes); the setup and tools-first split variants are gone.
  - D: the menu regrouped (Safety, Members, Engagement, Posts, Support, Gaming; Settings
    pinned at the foot) with groups that fold, kept in a cookie so the rail is drawn folded,
    a folded group still flagging Needs you, and arriving on a page opening its group. The
    Overview in four bands on 12 columns (attention or "All clear" with the health check,
    four numbers, the messages chart with top channels beside recent cases, module tiles);
    command reply time is on Status only. The phone head: one bar row with search behind an
    icon, the page bar as the visible title. Four breakpoints (520, 720, 1100, 1280); plans in
    the same order on phones. DESIGN.md's Layout, Page tabs and Navigation rewritten.
- **Landing clips (2026-11-17), deployed** (`174c9f3`, run 44096284680, dashboard): "Watch it work" shows three 1080p60
  clips (about 2.8 MB each) made in HyperFrames: the dashboard rebuilt with its real labels on a
  lime-lit stage, a 3D settle, a turning rim light and sheen, a drawn pointer, and steps a screen
  recording can't show (the channel list open). Rows beside their text, loading near the screen
  and playing only in view, with a pause button and a still for less motion. Source lives outside
  git in `promo/landing/` (`node build.mjs`, then `hyperframes render --fps 60 --crf 21` in each
  clip folder, with Shotcut's ffmpeg on the PATH).
- **Follow-ups (2026-11-17), deployed** (`eba3caf`, run 44022932381; migration 0072 applied
  and recorded, 73 rows; bot back at 05:19:44 UTC): Server Stats lists every counter as an
  option to tick; an "@" picker in template boxes (stats names, welcome card, messages, voice
  room names, Rally wording) inserts `{count}`, `{user}` and the rest, and mentions in
  messages; the AI assistant can put categories, a category's channels and roles in a new
  order and knows Discord's layout and role-hierarchy rules. Still to try on a test server:
  "tidy my server" with the AI assistant, Apply, then Undo.
- **Community requests (2026-11-17):** all eight are **deployed** (`3f76d1b`, runs 43981846349,
  44015846630 and 44016955567; migrations 0065 to 0071 applied and recorded, 72 rows; 33 slash
  commands registered). Still to check on a test server: the list in `docs/COMMUNITY_REQUESTS.md`
  and `docs/ECONOMY.md`.
- **Member pages (2026-11-16):** first build **deployed** with `7849b5a` (`docs/MEMBER_PAGES.md`).
  Next pieces: Roles, Suggestions, Giveaways.
- **Latest deploy:** `2e2b93f` (run 43918628506, dashboard only): steps 6 to 8 of redesign v2,
  the critique fixes, colorize, animate and the landing GIFs.
- **Redesign v2 (2026-11-16):** all five steps and Settings access are **deployed** (`3989146`,
  run 43794232829, with the Overview and the AI assistant's plan panel before them).
  Migrations through `0064_dashboard_access` are applied in production and recorded (65 rows
  in `drizzle.__drizzle_migrations`). Sessions from before 0064 list only servers shared by
  name until their next sign-in. Still to try by hand: the "Build me a…" box signed out in a
  browser on garrisonbot.com through Discord sign-in, an Editor's request in the bot, and
  "Remove from plan". Left over from the redesign (docs/REDESIGN_V2.md): editing on the
  Discord preview, Insights moderation and safety tabs, a ready-made template gallery.
- **Now:** Phases 1 and 3 to 11, the depth backlog and the Quartermaster cost controls are
  **deployed** (2026-11-12, run 43331916135). Migrations through `0050_plan_bundles` are applied
  in production and recorded in `drizzle.__drizzle_migrations` (0021 and 0022 had been
  applied by hand), so `pnpm db:migrate` starts from 0051. Slash commands are registered
  (26). Quartermaster stays off until `ANTHROPIC_API_KEY` is set as a GitHub secret; it's
  safe to set now (Haiku, daily credits, $5/day cap).
  Still to check on a test server: post a role menu and press its buttons, change Garrison's
  nickname from Settings, a welcome card on join, a scheduled message, a ticket from open to
  transcript, `/rank` drawing on the real host, a giveaway and a starred message.
  On a Pro test server, also check: voice XP and a boost, ending
  a season, attendance marks after a raid, a stat-role rule after `/link osrs`, and saving a
  server template then applying it in a second server you own. The calendar feed link should
  open in a calendar app. Next: Phase 2 (Stripe) once a price is set. The depth backlog is
  done; what's left needs the owner (Kick alerts, YouTube live, uploaded backgrounds).
- **Branch:** `dashboard-first`, pushed; everything through commit `2e2b93f` is deployed.
  The Card Table redesign and its critique fixes (through `c6d8efc`) are deployed (2026-11-13, run 43441441759).
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
| 2 | Stripe in test mode: Checkout, customer portal, webhook, then live keys | **Code done and tested in test mode** (2026-11-14); live keys and migration 0051 in production wait on the owner (`docs/pricing.md`) |
| 3 | Shared card editor (field editor + live preview + Pro-locked styling) | **Done** (not deployed) |
| 4 | Role menus (first module on the card editor) | **Code done**, not deployed: needs migration 0023 |
| 5 | Bot profile per server (name, avatar, banner, bio, card colors) | **Code done** (not deployed); card color and footer defaults moved to later |
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
- Pro: styling and branding (accent color, images, thumbnails, banners, custom emoji,
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
| Bot profile per server | Nickname | Avatar, banner and bio in this server; accent color on every card; footer without "Garrison" |
| Role menus | 3 menus, buttons or dropdown, template editor with live preview | Unlimited menus, accent color, images and banners, custom emoji, max picks, required roles, temporary roles |
| Welcome | Text welcome and leave messages, 1 role on join | Image welcome cards, colors, DM welcome, roles on join by condition |
| Tickets / modmail | 1 panel, 3 categories, claim, close, transcripts kept 30 days | Many panels, forms before opening, auto-assign, transcripts 365 days, branding, ticket stats |
| Message builder | Post cards with the standard look, 3 scheduled | Colors, images, link buttons, repeating schedules, 50 scheduled |
| Stream and video alerts | 3 feeds | 25 feeds, custom message and color |
| Giveaways and starboard | Basic giveaways, starboard | Entry requirements (role, level), bonus entries, custom look |
| Ranks | XP, levels, rewards, default rank card, voice XP | Custom rank cards (background, colors, character details), XP boosts by role or channel, seasons |
| Rally | 3 templates (exists) | 25 templates, notify a role (exists), custom card color |
| Ops | 25 scheduled raids, calendar view, calendar feed, web signup | Attendance history and reliability, custom card color, more raids |
| Watch (safety) | Everything: cases, undo, escalation, automod, mod notes, appeals, temporary bans | Bigger automod word lists and per-channel rules, appeal form branding |
| Gatehouse (safety) | Everything: anti-raid, anti-nuke, verification, web captcha, alt warnings, 1 manual backup | Scheduled backups, 30 backups kept |
| Ledger | 30 days, invite tracking, voice and nickname events | Up to 365 days, CSV export |
| Barracks | Link accounts, roster | Roles that follow game stats |
| Quartermaster | 3 plans a day | 15 plans a day, server templates |

**Custom rank cards (Pro).** Players fill in character details on their own card: in-game
name, class or main, server/realm, a short bio, and anything linked in Barracks (OSRS
stats, WoW characters). The server picks which fields exist; players fill them on the
dashboard (or with `/rank edit`). Rendered as an image, cached, regenerated on change.

**Bot profile per server (Pro).** Discord lets a bot set its own nickname in a server, and
(added 2025) a per-server avatar, banner and bio through Modify Current Member
(`PATCH /guilds/{id}/members/@me`). Confirm the fields in Discord's docs when building.
Card accent color and footer text come from the same settings, read by `lib/card.ts`.

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
  The **customer portal** handles card changes, canceling and invoices.
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
      blocks and dividers (reorder, remove), accent color, thumbnail, banner image and
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
      (Notifications, Games, Name color, blank), the card editor plus roles, picks and who
      can use it, the live preview with the real buttons or dropdown, Save (blocked in the
      browser when the server would refuse, so edits are never lost), Post/Update/Move in a
      channel (only the saved menu, never unsaved edits), Remove (undoable). Roles a menu
      can't give are left out of the picker; roles above Garrison are marked with how to fix.
      Search, Overview links, Settings history ("Role menus: Added Games") and the Settings
      map know about it.
- [x] Checked in the local preview (desktop, phone, light theme; no sideways scroll):
      add, edit, Pro refusal and undo, save, queue a post, history. Not checked: the bot
      posting and answering clicks against real Discord.
- Later: server (custom) emoji on Pro, temporary roles on Pro, button colors, the landing
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
- Later: server-wide card accent color and footer defaults (they must never recolour
  moderation and alert cards, whose colors report state).

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
      color, up to 4 details members fill in, and shared game accounts. Saved Pro looks pause on
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
      one role. Free 3 feeds (`alerts.feeds`), Pro 25 with your own message and color
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
      the ping and (Pro) the message and color with a live preview, each feed's status.
      Checked in the local preview (add from links, Pro refusal, statuses, phone width).
- Later: Kick (its public API needs an app review), YouTube live streams (needs the YouTube
  Data API key), a "send a test alert" button.

### Phase 11: giveaways (module "Spoils", plain label "Giveaways") and starboard

- [x] Giveaway rules (`packages/db/src/giveaways.ts`): prize, 1 to 20 winners, set lengths from 30
      minutes to 2 weeks. Free 2 running (`giveaways.running`), Pro 20 with entry rules, bonus
      entries and color (`giveaways.rules`). Weighted draw without repeats, tested for fairness.
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
      default, ignored channels, Pro color `starboard.look`); migration `0031_starboard`
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
- **Gatehouse:** [x] captcha verification on the website · [x] alt-account warning signs ·
  [x] full server backup and restore (channels, roles, permissions)
- **Ledger:** [x] invite tracking · [x] voice joins and leaves · [x] nickname changes ·
  [x] CSV export (Pro) · [x] the text of deleted and edited messages (off by default, a switch in
  Ledger settings; migration `0027_ledger_text`; only for messages Garrison saw since its last
  restart, capped at 1,500 characters, removed with the event)
- **Rally:** [x] LFG board on the dashboard for players (`/play/<server id>`, any member) · [x] no-show tracking (voice, with Ops attendance) ·
  [x] squads that repeat (`/lfg create repeat_weekly`, migration `0044_lfg_repeat`)
- **Ops:** [x] calendar view · [x] calendar feed (ICS; migration `0042_ops_calendar`) · [x] attendance history per member (Pro `ops.attendance`, migration `0043_attendance`) ·
  [x] signing up from the web (the same player page)
- **Ranks:** [x] XP for time in voice · [x] XP boosts by role or channel (Pro `ranks.boosts`; migration `0045_voice_xp_boosts`) · [x] seasons (Pro `ranks.seasons`; migration `0046_rank_seasons`) ·
  [x] custom rank cards (phase 9)
- **Barracks:** [x] more game accounts (RuneScape 3, claimed) · [x] roles that follow game stats (Pro `barracks.statRoles`; migration `0047_stat_roles`)
- **Quartermaster:** [x] server templates that copy a layout (Pro `qm.templates`; migration `0048_server_templates`) · [x] scheduled backups (shares
  the Gatehouse backup engine; weekly on Pro)

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

## Feature pass (proposed 2026-11-14, waiting on the owner's pick)

What gaming servers usually add a second or third bot for, and Garrison doesn't do yet. Each
follows the plan rule: safety is free, Pro sells look, scale and history. Ranked by value for
the effort.

**Next (high value, builds on what exists)**

1. **Stripe checkout (Phase 2).** [x] Built and tested in test mode 2026-11-14. Turns the published prices on. Needs the owner's Stripe
   account, and the Stripe plugin authorized (`/mcp`) to create the products.
2. **Voice rooms (join to create).** [x] Built 2026-11-14 (migration 0052; needs Move Members). Join a "New room" channel and get your own voice channel,
   deleted when empty; the owner can rename, lock, set a limit and pass ownership. The most
   common gaming-server bot after moderation. Free: 1 creator channel. Pro: several, per-game
   name templates, rooms that follow the Rally group's game.
3. **Scam and phishing links (Moderation, free).** [x] Built 2026-11-14 (migration 0053). Fake Nitro and Steam-gift links are the most
   common attack on gaming servers. A maintained list of known scam domains plus look-alike
   detection (discorcl, steamcomrnunity); remove the message, open a case, optional timeout.
4. **Suggestions board.** [x] Built 2026-11-14 (migration 0054). Members post ideas with a button or `/suggest`; a card with up and
   down votes; staff mark Planned, Done or Declined from a dashboard queue. Reuses the card
   editor and the ticket queue. Free: 1 board. Pro: several boards, custom look, anonymous mode.
5. **Server insights.** [x] Built 2026-11-14 (migration 0055). Joins and leaves, active members, messages by channel and hour, who
   stays after a week, invite sources (Logs already tracks most of it). Free: 30 days. Pro: a
   year and CSV export. A strong reason to pay that costs almost nothing to run.

**Then (smaller, well understood)**

6. **Auto-responses and saved replies.** A trigger word or `/faq name` posts a card (rules,
   how to apply, server IP). Free 10, Pro 100 with the card editor's look.
7. **Member pages (Phase 4 in `docs/DASHBOARD_FIRST.md`).** Members without Manage Server get
   their rank card, groups and raids, linked accounts and their own cases. Decides the open
   question; `/play` is already half of it.
8. **Birthdays and milestones.** Members set a birthday; a message and a role for the day;
   anniversary roles (1 year in the server). Small, loved by communities.
9. **Sticky messages and auto-clean channels.** Keep a note at the bottom of a channel;
   clear an LFG or screenshots channel after N hours.
10. **Verify with a game account.** A role only after linking a game account (Game accounts),
    with stat roles already built on top.

**Bigger bets**

11. **Tournaments and scrims.** Sign-ups, check-in, a bracket drawn on the dashboard and in
    Discord, results that feed ranks. Builds on Groups and raids; a real differentiator.
12. **AI helpers (Pro, inside the existing credits and spend cap).** Ticket summaries and a
    suggested first reply; an AI answer in a help channel from the server's own FAQ.
13. **Game news feeds.** Steam patch notes, a game's server status and subreddit posts, beside
    stream alerts.
14. **Kick and YouTube live alerts.** Already planned; waiting on keys and Kick's app review.

## Open decisions for the owner

- **Price** (approved 2026-11-13 by deploying, `docs/pricing.md`): **Pro
  $8.99/mo or $79.99/yr per server**, and a new **Agency** plan, Pro on up to 5 servers for
  **$34.99/mo or $349.99/yr**. Worst-case AI use leaves $7.20 (Pro) and $27.53 (Agency) a month
  after Stripe. Prices live in `PRICING` (`packages/db/src/plans.ts`); checkout
  turns on once Stripe is configured (`docs/pricing.md`). Earlier research (2026-11-12): MEE6 about $11.99/mo; Dyno
  about $4.99–5.99; Carl-bot $3.99–7.99; Ticket Tool $7.99; Apollo $7.99; Arcane about $7;
  Sesh $5–6.99; Raid-Helper €25/yr.
- **Free AI pool** (recommended, not built): split `QM_DAILY_BUDGET_USD` into a shared Free
  pool ($2 a day) and paid servers, so Free use can never stop Pro or Agency.
- **Quartermaster AI costs** (`docs/ai-costs.md`): decided 2026-11-12, built: Claude Haiku
  5.5 called directly through Anthropic, daily credits (Free 3, Pro 15), 10 attempts an hour,
  output capped at 4,000 tokens, a $5/day global spend cap (`QM_DAILY_BUDGET_USD`). Worst
  case $1.17 a month per Pro server against $4.02 net. Needs migration `0049_ai_usage` in
  production (applied 2026-11-12).
- **Rank card uploads:** stored in Cloudflare R2 (`garrison-media`, served at
  `media.garrisonbot.com`); the owner enables R2 in the Cloudflare dashboard first. Default
  backgrounds ship in the repo. Plan and image prompts: `docs/rank-card-backgrounds.md`.

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
- 2026-11-12: Backlog: alt-account warnings (joins that look like a recent ban: name, account age,
  avatar), posted to the security alert channel.
- 2026-11-12: Backlog: server backup and restore (owner-only, additive, idempotent; Free 1 kept,
  Pro 30 and weekly). Migration 0041.
- 2026-11-12: Backlog: Ledger invite tracking (new intent `GuildInvites`, not privileged; top
  inviters on the Ledger page) and CSV export on Pro (`ledger.export`). Voice and nickname
  events were already logged.
- 2026-11-12: Backlog: Player page `/play/<server id>`: any member joins or leaves groups and
  signs up for raids from the web; the bot accepts lfg_join/lfg_leave/raid_signup/raid_withdraw
  without Manage Server, acting only on the requester.
- 2026-11-12: Backlog: Ops calendar: five weeks of raids (weekly ones projected) on Rally and
  the player page, and an ICS feed behind a secret link the dashboard makes, resets or turns
  off. Migration 0042.
- 2026-11-12: Backlog: Attendance and no-shows (Pro `ops.attendance`, opt-in): the minute sweep
  marks raid signups and group members seen in voice around the start, the rest missed; Rally
  shows 90-day reliability and staff can correct raid marks. Migration 0043.
- 2026-11-12: Backlog: Weekly groups: `/lfg create repeat_weekly` reposts a group a week on
  (same local time) after its run, host reseated; `/lfg close stop_repeating` ends it. Needs
  `pnpm commands:deploy`. Migration 0044.
- 2026-11-12: Backlog: Voice XP (10 a minute with company, shared cooldown) and XP boosts on Pro
  (role, channel or category, ×0 to ×3, max 10, history and undo). Migration 0045.
- 2026-11-12: Backlog: Ranks seasons on Pro: a season_start request keeps the top 100 in
  rank_seasons and resets XP in one transaction; the Ranks page lists past seasons; the
  leaderboard hides 0 XP. Migration 0046.
- 2026-11-12: Backlog: Barracks: `/link rs3` (RuneScape 3 hiscores, claimed) and Pro roles from
  game stats (up to 10 rules over shared accounts, synced every 30 min and on /link, unsafe
  roles never given). Needs `pnpm commands:deploy`. Migration 0047.
- 2026-11-12: Backlog: Quartermaster server templates on Pro: save a server's layout to your
  account (5 max) and apply it in another server you own; owner-only, additive by name,
  permissions masked. Migration 0048.
- 2026-11-12: Backlog: Depth backlog finished (Rally, Ops, Ranks, Barracks, Quartermaster). 470
  tests, type-check and Biome clean. Nothing pushed or deployed.
- 2026-11-12: Deployed. Migrations 0023-0048 applied to production through the Supabase
  connection (no local .env), and 0021-0048 recorded for drizzle. The first run stopped at
  preflight, which wrongly expected the bot to read appeals and ticket notes; fixed the lists
  (506f9d0) and redeployed.
- 2026-11-12: Quartermaster moved to Claude Haiku 5.5 (direct Anthropic) with daily credits
  (Free 3, Pro 15, refunded on failure), 10 attempts an hour, a 4,000-token output cap, a global
  daily spend cap (QM_DAILY_BUDGET_USD, $5) and an ai_usage ledger of every call's tokens and
  cost. Migration 0049. Deployed.
- 2026-11-13: Dashboard pass, deployed (run 43346221842): plain module names (Tickets,
  Moderation, Leveling...), higher-contrast tokens, "Requires Pro" badges, clearer settings
  rows, drawn empty states, a layout fix at 721-850px, faster page switches (loading frame, one
  shared Discord read per server, session touch after the response), Pro embed extras on cards
  (author line, title link, fields; `cards.embed`), and rank card details read from shared game
  accounts. No migrations.
- 2026-11-13: Speed: the dashboard wakes the bot through a private service binding
  (BotControl.poke) the moment a request is queued, instead of waiting for the 5 s check; the
  dashboard checks for the result every second for the first 10 s; up to 5 database connections
  per request (a page's parallel queries had been queuing on one); Smart Placement for the
  dashboard Worker; session and server lookups in parallel. The bot deploys before the dashboard
  when the binding is new.
- 2026-11-13: Dashboard redesign, "Card Table" (impeccable new-work, deployed in run 43441441759):
  a lifted slate-blue dark default and a cool light theme. Each part of the server has a color:
  Safety azure, Community orchid, Gaming volt, Server steel. That color lights the menu gem,
  the title gem, the section tag, the primary button, switches and open panels. Archivo is now
  the one typeface (Saira, Inter and JetBrains Mono are gone). Status is shown by shape as well
  as color: dot for on, ring for waiting, triangle for needs you, dash for off. "Requires Pro"
  is printed in foil, which nothing else uses. HUD brackets, chamfers and the glint are gone.
  Time is drawn to scale: ticket waits, raid countdowns and lockdowns. Card text is held to
  68ch. Phone fixes: filter rows scroll, and head actions stack. The card editor's `.block`
  grid no longer squeezes the server picker. DESIGN.md is rewritten. The finish review took
  two rounds; still open: the lockdown bar is unseen in a capture (no timed lockdown in the
  seed), and the section tag carries no live count.
- 2026-11-13: Critique fixes (impeccable critique scored 24/40; the owner chose to fix
  everything, phone first). Phones: the menu is one "current page" button that opens a sheet
  of the four sections (44px items); the Moderation search takes a full row and cases stack as
  cards with Undo in reach; Sign out moves to the account page; the search hint reads Ctrl K or
  ⌘K and hides on touch. The section color now owns each page head (a tinted name card), the
  current menu item and open panels. Safety moved to cobalt and Community to a pinker orchid,
  away from the info blue; case tags (warn, ban) are neutral, removals heavier. Security and
  Welcome use the shared settings row; duplicate head buttons and the second "Edit ladder" are
  gone; one primary per screen on Groups and raids; one date format. Plain names everywhere
  (no Watch, Ledger, Quartermaster, Herald or Ranks in copy). Logs take a member name and show
  names, not IDs (cached 10 min). Undo a case and Close ticket ask once. Role and channel
  pickers are checkboxes, not Ctrl-click lists. A skip link, shorter attention-row link names,
  an empty /status history explained, the appeal link gets a copy button, and the theme
  toggle keeps you on the page. Not done: new login and 404 art, replying to tickets. Deployed with
  the redesign (run 43441441759).
- 2026-11-13: One box per item (committed, not deployed): ticket questions, automod blocked
  words and anti-nuke trusted IDs are lists of numbered boxes (ListField: Enter opens the next,
  Backspace in an empty box removes it, a count shows how many fit). Raid, group and template
  roles are rows of a name and a count (SlotRows); the server joins them back into the text
  the parser reads (lib/slots.ts, tested). Checked in the preview: questions, blocked words
  (saved), raid roles, template roles (saved and reloaded). Trusted IDs are owner-only, so
  they weren't tried in the preview. Deployed (run 43475488699).
- 2026-11-13: Agency plan and pricing (deployed in run 43483886544; 0050 applied and recorded in production): `docs/pricing.md` proposes
  Pro $8.99 and Agency $34.99 for 5 servers, checked against worst-case AI use. Migration
  `0050_plan_bundles` (not yet applied in production): `plan_bundles`,
  `guild_plans.bundle_id`, `plan_source` gains `bundle`, and functions that let only a plan's
  owner fill or free a seat (never past the count, never over a server with Pro another way)
  and let staff give an Agency plan for free. The Plan page shows Free, Pro and Agency side by
  side with this server's plan and an owner's seat button; the account page lists your seats;
  the staff page gives Agency plans; the landing page shows the three plans as "at launch".
  Tested in `repo/agency.test.ts` and in the local preview.
- 2026-11-13: Subscription polish (impeccable polish, deployed in run 43483886544): plan cards show
  "$0" and "save N%" the same way on the dashboard and the landing page, ticks in the page's
  color, "Opens at launch" on paid cards, a plain "This server is on Free / has Pro" line and
  "All 5 seats free". The staff page gets a readout of plan counts, labeled Agency rows and a
  plain notice. Pro features on Free share one slot (`ProUpsell`) and every plans link says
  "See plans". The landing flag reads "Recommended" (no usage claim).
- 2026-11-13: American spelling everywhere (deployed in run 43483886544): color, center, gray,
  labeled, canceled, defense, armor, neighbor, humor, anymore, math, toward and the -ize forms,
  across the dashboard, bot replies, landing page, docs and comments. Saved status values
  (`cancelled` in the database) and `aria-labelledby` are unchanged, as they must be.
- 2026-11-14: Phase 2, Stripe checkout (committed, not deployed): Upgrade (monthly or yearly)
  opens Stripe Checkout for Pro on a server or for an Agency plan; the payer gets Manage billing
  (Stripe's customer portal). A webhook at `/api/stripe/webhook` checks the signature, re-reads
  the subscription from Stripe and applies it through the new `garrison_billing` login, which
  can only call `billing_set_guild`, `billing_set_agency` and `billing_record_event` (migration
  `0051_billing`). Disputes and early fraud warnings cancel the subscription; Pro stays on
  through payment retries. Checkout switches itself on once the Stripe secrets are set, so
  `PAID_PLANS_LIVE` is gone. Reviewed against Stripe's best practices (separate products per
  plan, no payment method list, risk events, an integration label). Tested end to end in the
  owner's sandbox: subscribe, cancel at period end, cancel. Owner steps left: live products,
  webhook, portal, a restricted key, Stripe Tax, the billing login's password and the GitHub
  secrets, then migration 0051 in production.
- 2026-11-14: Voice rooms (committed, not deployed): joining a creator voice channel makes the
  member their own room beside it (or in a chosen category) and moves them in; the owner gets
  Discord's channel controls on that room only (rename, limit, who joins); it passes to someone
  still inside when the owner leaves and is deleted once empty, with a sweep that tidies up
  after restarts. Dashboard page under Gaming with settings (history and undo), the rooms open
  now, and a warning when Garrison lacks Move Members. Free: 1 creator channel and the
  standard name; Pro (`voice.creators` 5, `voice.names`): more channels and your own name with
  {user}. The invite now asks for Move Members (existing servers grant it or re-add Garrison);
  the health check lists it as optional. {game} was left out: it needs the privileged Presence
  intent. Migration `0052_voice_rooms`. Not yet tried against a real Discord server.
- 2026-11-14: Scam and phishing links (committed, not deployed): a new Automod switch, on by
  default, free, and working even with the rest of Automod off. It reads each link's address
  and catches look-alikes (steamcomrnunity, discorcl, dicsord), a brand plus bait in someone
  else's address (discord-nitro, free-steam-gift) and an official address hidden at the front
  of another (discord.com.gift-claim.xyz), while official sites and ordinary ones
  (discord.js.org, discordbotlist.com) pass. A hit removes the message and times the sender
  out for an hour with a case (usually a hacked account, so no ban). No list to fetch or keep
  fresh (`packages/db/src/scam-links.ts`, tested). Migration `0053_scam_links`.
- 2026-11-14: Suggestions board (committed, not deployed): `/suggest idea:` posts a numbered
  card in the chosen channel with For and Against buttons (a second press takes the vote back,
  the other button switches it; one suggestion a minute per member). The Suggestions page
  (Community) has the settings, a board filtered by status with counts, and a status plus
  note per suggestion that the bot writes onto the card; Done and Declined close voting. Pro:
  anonymous mode (the card hides the author; staff still see it). One board per server for
  now; several boards and a custom look were left for later. Migration `0054_suggestions`.
- 2026-11-14: Server insights (committed, not deployed): a new Insights page (Server group)
  with totals (messages, active members, net joins, the share who stayed a week), messages per
  day, joins above and leaves below one axis, busiest hours in the reader's own time, busiest
  channels and where members come from (inviter, joins, stayed a week). Free: 7 or 30 days.
  Pro: 90 days or a year, and a CSV of every day. The bot's once-a-minute metrics flush now
  also counts messages per channel per day, per hour and per member per day (counts only,
  never content), and joins and leaves are kept with their invite apart from the log's
  retention. `insights_prune()` (owner-run, no arguments) folds per-member days into plain
  daily counts after 35 days and drops everything past 400. Migration `0055_insights`.
  Counting starts at deploy: there's no history before it.
- 2026-11-14: Stripe recheck. Checkout had started failing: Stripe turned on Managed Payments
  by default, which refuses products without a tax code. Test products now use
  `txcd_10103000`; the setup notes say to do the same live and to decide on Managed Payments.
  A refused checkout or portal now shows a notice instead of a crashed page. A full test
  checkout turned Pro on and cancelling turned it off.
- 2026-11-14: Terms of Service, Privacy Policy and Refund Policy pages (`/terms`, `/privacy`,
  `/refunds`), served on the public site and linked from the landing footer, sign-in and the
  Plan page. Refunds: 7 days from the first payment, unless the server used more AI plans in
  a day than Free allows. Owner steps (mailbox, Discord portal URLs, Stripe public details)
  are in `docs/pricing.md`.
- 2026-11-15: Deployed `3501e1f` (Stripe checkout, voice rooms, scam links, suggestions,
  insights, policies). Migrations 0051 to 0055 applied in production and recorded. Still
  owner-side: live Stripe keys and products (with tax code), the billing login's password,
  Move Members for voice rooms on existing servers, and the policy URLs in Discord and Stripe.
- 2026-11-15: Landing page cleanup. The themed module names are gone from the landing, the
  policies and the bot's message footers and `/health` (they now read Moderation, Security,
  Groups and so on). "Also in the box" (three modules) is replaced by a grouped list of all
  17 modules. Hero, call to action and FAQ follow whether paid plans are open. Times are
  12-hour. Not deployed.
- 2026-11-15: Release prep. "Early access" is gone from every page: the landing always shows
  release pricing, and the Plan page says "Checkout isn't available right now" only if Stripe
  isn't configured. New Discord avatar and profile banner (`apps/web/art/discord/`) and a new
  link-preview image, drawn from the shield in the landing's colors. `docs/RELEASE.md` lists
  everything left before release: Stripe live, `ANTHROPIC_API_KEY` (the AI builder has never
  run in production), `OPENAI_API_KEY`, the support mailbox, and the Developer Portal settings
  with exact values. Not deployed.
- 2026-11-15: Stripe live mode set up: both products with the tax code, the four prices
  (same lookup keys as test), the webhook with all ten events, and the customer portal. The
  portal is now one configuration per plan, so monthly/yearly switching can't cross from Pro
  to Agency; Manage billing picks the plan's own (`portalConfiguration()`). Still owner-side:
  the restricted live key, the GitHub secrets, the billing login's password, Managed Payments
  and Stripe's public details.
- 2026-11-15: Deployed `d618d55` (run 43673213974): landing cleanup, release copy, new link
  preview, plain names in bot footers, per-plan billing portals. Live pages checked. Checkout
  stays closed until the four `STRIPE_PRICE_*` secrets and `BILLING_DATABASE_URL` are set and
  the `garrison_billing` login is enabled; then deploy again.
- 2026-11-15: Deployed again (run 43673660924) with every Stripe secret and
  `BILLING_DATABASE_URL` set and the `garrison_billing` login enabled, so checkout is on in
  production. Not yet checked with a real purchase (release-day step in `docs/RELEASE.md`).
- 2026-11-15: Deployed again (run 43674709784) with `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`
  set, so the AI builder and AI moderation can run in production. The owner set up the bot's
  Discord profile (icon, banner, About me, tags, policy links). Bot online after the deploy;
  the AI builder isn't yet checked with a real plan.
- 2026-11-15: AI builder limits by plan (`AI_PLANS_PER_DAY`): Free 2 a day per person across
  all their Free servers (and 2 per server), Pro 15 and Agency 20 per server. Agency is told
  apart by the seat (`guild_plans.bundle_id`). The AI builder page shows what's left for the
  person asking. Bot replies and audit-log reasons say "AI builder" instead of Quartermaster.
  No migration needed. Not deployed.
- 2026-11-15: Deployed `1d836a6` (run 43676594148) with the Twitch and Battle.net keys set:
  new AI builder limits, "AI builder" wording in the bot, Twitch stream alerts and verified
  Battle.net accounts are live. Bot online after the deploy.
- 2026-11-15: Battle.net linking fixed: the form's redirect to Battle.net's sign-in page was
  blocked by form-action, which only allowed oauth.battle.net. Linking now picks a version
  (Retail, Classic, Classic Era; Forever once Blizzard publishes an API namespace), and each
  version and region keeps its own characters.
- 2026-11-15: AI builder designs full sections: new instructions (build what the admin is
  trying to achieve, size voice rooms and roles to the game, topics and slowmode, match the
  server's naming, list what didn't fit in notes) instead of "keep plans small". Output cap
  raised from 4,000 to 6,000 tokens; worst-case plan cost $0.0036. Not yet tried against the
  real model. Not deployed.
- 2026-11-15: AI builder counts changes, not plans: a plan makes up to 20 and uses only what it
  makes, the rest carry to the next plan (`AI_CHANGES_PER_DAY`: Free 40 per person, Pro 300,
  Agency 400 per server), with a separate request cap for AI cost (`AI_REQUESTS_PER_DAY`: 6,
  40, 50). Continuing: a waiting plan can be revised into the next version (it replaces the
  old one), and a built plan can be continued, with the model told what it built, the line's
  earlier requests and its own notes. Page redesigned: work column (describe or continue,
  plan with notes and "Change this plan"), a rail with today's changes as a plan-segmented
  gauge and the rules, and a compact Builds timeline. Needs migration `0056_qm_continue`
  (notes, continues_id on qm_builds) in production before deploying. Not deployed.
- 2026-11-15: Deployed `bd9ae40` (run 43678760337) after applying migration 0056 in production
  (recorded; 57 rows). Live: Battle.net sign-in fix with the version choice, the AI builder's
  fuller designs, change allowance, continuing plans and new page. Bot online; checked the
  live pages, the form-action header and the new plan wording. Not yet tried with Battle.net
  or the real AI model.
- 2026-11-15: AI builder chat and permissions. The AI builder page leads with a conversation:
  Garrison asks one question at a time with quick replies, drafts a plan when it knows enough,
  and revises it in the same thread (qm_messages, per person; `qm_chat` dashboard action;
  20/100/150 messages a day). Plans can make channels read-only or listen-only with posters,
  and give new roles allowlisted member permissions (QM_ROLE_PERMISSIONS); only permissions
  Garrison holds are set, which also fixes private voice channels asking for Speak. The invite
  adds those member permissions (integer 1546577637110; /health flags older servers). Needs
  migration 0057 in production. Not yet tried against the real model. Not deployed.
- 2026-11-15: Deployed `1a0ed4a` (run 43682605713) after applying migration 0057 in production
  (recorded; 58 rows). Live: the AI builder chat, read-only and listen-only channels, safe role
  permissions, and the wider invite. Bot online. Not yet tried with the real model; the
  Developer Portal install link still needs the new permissions integer (1546577637110).
- 2026-11-15: Planned the AI assistant (`docs/AI_ASSISTANT.md`): one daily currency,
  **Supplies** (change 1, message 3; Free 40 per person, Pro 300, Agency 400 per server),
  replacing plans, changes, requests and chat caps; and dashboard tools for the AI (read
  settings; propose settings changes through `EDITABLE_FIELDS` and the dashboard's own
  checks; post role menus, ticket panels and saved messages; never moderation, anti-nuke or
  billing). Five phases; nothing built yet. Open: bot grants for settings, rename to
  "Assistant", model choice.
- 2026-11-15: AI builder supplies (docs/AI_ASSISTANT.md phase 1). One daily currency replaces
  the change, request and chat allowances: every AI call (chat message, plan, revision) costs 3,
  every change a plan makes costs 1 (`AI_SUPPLIES_PER_DAY` Free 40 per person across Free
  servers, Pro 300, Agency 400 per server). Counted from `ai_usage` and `qm_builds` under the
  same per-server lock; failed calls, plans refused as unsafe, and discarded or expired plans
  give theirs back. Hourly limits and the global budget stay. The rail, composer, plan card,
  /qm card, pricing lines, Refund Policy (now counts supplies) and docs/pricing.md updated;
  worst-case cost per server is now above the Pro and Agency price, bounded by the hourly and
  global caps. No migration. Not deployed.
- 2026-11-15: AI builder reads settings (docs/AI_ASSISTANT.md phase 2). The chat can look at
  how Garrison is set up before answering: `server_overview` (plan, supplies, every module's
  switches and counts) and `module_settings` (one module in full, channels and roles as
  names). Read-only, through `readSettings` (the editable fields only; the bot role can read
  every settings table, tested). At most 4 model rounds a message, the last must answer; the
  budget hold covers all 4. It can't change settings yet: it says which page does it. Page
  copy mentions asking about the setup. No migration. Not deployed.
- 2026-11-15: AI builder changes settings (docs/AI_ASSISTANT.md phase 3). A chat plan can
  change settings in Suggestions, Starboard, Voice rooms, Automod, Welcome (switches,
  channels, join roles), Leveling, Logs and the mod log, each field checked by the
  dashboard's own rules (`checkQmSettings`), never with a role that has moderation or admin
  powers. Each field costs a supply. Checked again at build, applied after the structure
  with the plan's new channels and roles swapped in, recorded in the settings history, and
  undone through it (a field someone changed since is left). The plan preview lists every
  setting from → to. Migration 0058: `qm_builds.settings`, and bot grants on exactly those
  fields plus `settings_changes` (read and add only). Not deployed; 0058 must be applied in
  production first.
- 2026-11-15: Deployed `e474e74` (run 43742510546) after applying migration 0058 in production:
  AI builder supplies, settings reads and settings plans (docs/AI_ASSISTANT.md phases 1 to 3)
  are live. Site, /healthz and /status answer; the bot is online. Not yet tried with the real
  model.
- 2026-11-15: AI assistant posts and rename (docs/AI_ASSISTANT.md phases 4 and 5). A chat
  plan can post saved role menus, ticket panels and messages (up to 5, one supply each)
  through the dashboard's own post requests, as the admin who asked; Undo leaves posts. The
  AI builder is now called the AI assistant everywhere people read it (URL and `/qm` stay),
  with new starter prompts and an "I can" list in the empty chat. Migration 0059
  (`qm_builds.posts`). Not deployed; 0059 must be applied in production first.
- 2026-11-15: Deployed `234cd49` (run 43748483303) after applying migration 0059 in production:
  AI assistant posts and the rename are live. Site, /healthz and /status answer; the bot is
  online. Not yet tried with the real model.
- 2026-11-15: AI assistant page condensed: one column with the chat, a thin supplies bar under
  the composer, then the running draft with one Apply build button (each new draft replaces
  the last, so there's nothing to approve per version) and a collapsible Show changes (the
  server preview, settings from → to, posts, notes). The Builds list is a collapsible Build
  history with Undo; Plan vN, Change this plan, Continue and the sidebar are gone (the chat
  continues from what was built). Polished with impeccable. Not deployed.
- 2026-11-15: Deployed `9de6e3f` (run 43753878809): the condensed AI assistant page is live.
  Site, /healthz and /status answer; the bot is online.
- 2026-11-15: Proposed supplies v2 (`docs/AI_SUPPLIES_V2.md`): a supply is $0.001 of AI,
  charged by what a message really costs; monthly pools (Free 200 per person, Pro 3,000,
  Agency 13,000 shared); a 13-supply hold per message (3 rounds); supply packs (1,000 for
  $2.99, 5,000 for $11.99). Worst-case AI under half of net for every plan and pack. Waiting
  on the owner.
- 2026-11-15: Supplies v2 approved as proposed. Step 1, metering: a call holds the most it
  can cost (3 rounds × 12,000 tokens in at the cache-write rate + 6,000 out = 14 supplies;
  13 in the proposal, plus the cache-write premium) and is charged what it really cost, 1
  supply per $0.001, rounded up. Failed calls are charged what they used; plans Garrison's
  checks refuse are free. Near the end of a pool a message gets fewer rounds and a shorter
  answer (down to 4 supplies). Each reply records what it cost and the page shows it.
  Migration 0060. Pools are still daily until step 2. All checks pass.
- 2026-11-15: Supplies v2 step 2, monthly pools: Free 200 a month per person (and per
  server), renewing on the 1st UTC; Pro 3,000 per server and Agency 13,000 shared by its
  servers, renewing with the billing period a month at a time (yearly plans too; staff-given
  plans use the calendar month). Agency calls record their plan (`ai_usage.bundle_id`) so a
  seat swap can't refill the pool. The global daily budget is now a circuit breaker: $2 plus
  $0.30 a day per Pro server and $1.30 per Agency plan. Plan cards, Refund Policy, chat
  messages and the supplies bar say "a month" and when the pool renews. Migration 0061.
  All checks pass.
- 2026-11-15: Supplies v2 step 3, supply packs: 1,000 for $2.99 and 5,000 for $11.99, for
  any server, bought on the Plan page's new "AI assistant supplies" section (this month's
  pool, packs, Buy buttons, packs bought) through a one-time Stripe Checkout (price set in
  `plans.ts`, so no new Stripe prices or settings). The webhook grants a pack only when the
  session is paid and charged that pack's price, once per session
  (`billing_grant_supplies`); a full refund, dispute or fraud warning stops what's left
  (`billing_revoke_supplies`). Packs are used after the pool, soonest to expire first, and
  only for what was really spent (finished calls and made builds, never holds). The assistant
  page shows pack supplies and a "Buy supplies" link when low; the out-of-supplies message
  points to the Plan page. Refund Policy: unused packs refunded in full within 14 days.
  Migration 0062. Checked in the local preview (desktop and phone). All checks pass.
- 2026-11-15: Supplies v2 step 4, prompt caching: the assistant's instructions go as a
  cached block (5 minutes, read back at a tenth of the price across every server), and a
  chat message that can look at settings also caches its rounds. `ai_usage` records cached
  tokens and prices them at the cache's rates. Not yet checked against the real API. Supplies
  v2 is built (steps 1 to 4); not deployed: production needs migrations 0060, 0061 and 0062
  before the code. Docs (`AI_SUPPLIES_V2.md`, `pricing.md`, `GO-LIVE.md`) updated. All checks
  pass (558 tests).
- 2026-11-15: Deployed supplies v2 (`28aad3d`, run 43770218778). Migrations 0060, 0061 and
  0062 applied in production first (drizzle log: 63 rows; the 7 earlier calls backfilled at
  3 supplies). Landing page shows the monthly pools, the Refund Policy covers packs,
  /healthz and /status answer, and the bot is online. Not yet seen in production: a real
  pack purchase, and cached tokens on a real AI call.
- 2026-11-15: Supplies v2 tested on the real API in production (GuildWright, Pro): a
  settings question that looked at settings cost $0.0014 and was charged 2 supplies; a
  4-change plan cost $0.0007 and was charged 1. The second message read 7,517 tokens from
  the cache. The pool showed 2,993 of 3,000 (3 for the messages, 4 held by the waiting
  draft). No build was applied. Also: the dashboard rail scrolls on its own and the phone
  menu stays pinned (`dd0dfeb`), not deployed.
- 2026-11-15: Dashboard redesign, the Console world (our own style, heavily inspired by
  Peak Bot, replacing Card Table). Phase 1 (`731e085`): near-black floor, flat panels,
  white primary buttons and switches, a full-height server rail (logo, server card, menu
  with a white current pill, plan at the foot) beside a slim top bar. Phase 2 (`3d0a1f8`):
  the AI assistant as a workspace, chat beside a live plan panel (counts, tabs, channel
  tree with New marks, Apply build). Checked locally on desktop, phone and light theme. Not
  deployed. Next: phase 3, module pages as panels with header bars and editors beside live
  previews, then DESIGN.md.
- 2026-11-15: Console redesign phase 3: every panel's first line is a header bar (section
  gem in a tinted tile, title, count pill, action on the right) across all module pages;
  Role menus and Messages show saved items as a tile grid with a dashed "new" tile, opening
  across the row to edit; Welcome's preview stays in view and its variables are colored
  chips. DESIGN.md and `.impeccable/design.json` rewritten for the Console world. Checked
  locally on desktop and phone (no sideways scroll). Not deployed.
- 2026-11-15: Deployed the Console redesign (`183d739`, run 43776865566); live with the new
  rail, header bars and tiles, /healthz and /status answer, bot online. Then the Overview in
  the same style: a server header card (member and online counts from Discord's
  `with_counts`), the AI assistant offer until it's first used, a five-stat row with
  week-over-week changes, a 14-day messages chart beside top channels, a modules list with
  on/off dots beside recent cases, then raids, security and health. The e2e Discord mock
  ignores query strings and returns counts. Not deployed.
- 2026-11-15: AI assistant plan panel, Peak-style depth: every channel and role in the tree
  opens its details (a channel's topic and, per role, how many permissions are allowed or
  denied, expandable to the names; a role's color, power and permissions). "Remove from
  plan" on new channels, roles, settings and posts: a new `qm_remove` request the bot carries
  out by storing the rest as the next version (taking whatever depended on the item with
  it). A Features tab: the eight modules the assistant can set, each with its switch and
  fields, saved one at a time through the same checks and Settings history as their pages.
  Migration 0063 (the new request kind). Not deployed.
- 2026-11-16: Walked Peak Bot's landing page and all 23 dashboard pages (read only, the
  owner's account) and wrote `docs/REDESIGN_V2.md`: what makes it feel polished, the system
  changes (neutral greys, open panels that save themselves, a Pro sheet, preset and level
  cards, one list template, quiet page heads), a page-by-page map and an order. Waiting on the
  owner's decisions (font, autosave, where to start).
- 2026-11-16: Redesign v2, step 1 (system) done. Owner's picks: keep Archivo, autosave with
  Undo, build in order. Neutral greys, 12/8 corners, quieter page titles (`d293aaa`). Then a
  second read-only look at Peak and the rest of the system, each tried on one page: panels
  that save themselves with a save mark and an Undo toast (Logs), the Pro sheet that every foil
  tag and "See what Pro adds" opens (straight to Checkout), segmented rows, level cards and
  preset cards (Moderation, Security), and one list head with filter pills, a count and the
  dashed new tile (Giveaways). Settings actions now return their outcome to a self-saving form
  and still redirect a plain post. Checked locally on desktop, phone and light theme. Not
  deployed. Next: step 2, the safety pages (Moderation, Security, Logs) in the new shape.
- 2026-11-16: Redesign v2, step 2 (safety pages) done. One page shape: a main column of open
  panels beside a side column for tools and live lists. Moderation: automod split into five
  self-saving panels (its on switch in the header bar, spam presets Relaxed/Balanced/Strict/
  Custom that fill the numbers, links, blocked words saved per word, AI, exemptions), with
  Moderate a member, what automod caught and the case settings beside them. Security:
  anti-raid and verification save themselves, with raid and anti-nuke presets; lockdown,
  quarantine and backups in the side column. Logs: settings beside top inviters and the
  download, filters in the table head. `saveAutomod` returns its outcome to a self-saving
  panel and keeps the fields a panel doesn't send. Checked locally on desktop, phone and
  light theme. Not deployed. Next: step 3, the community pages.
- 2026-11-16: Redesign v2, step 3 (community pages) done. Welcome: the welcome, leave and DM
  cards save themselves beside their previews (held with the reason when a channel is
  missing or a Pro field is on Free), roles on join and the welcome image two up. Role menus:
  the list head with Posted / Not posted. Tickets: stat row, queue pills beside a self-saving
  "Who handles tickets", panels as tiles. Leveling: leaderboard beside Leveling, boosts and
  seasons; the rank card saves itself; level rewards keep Save. Settings diffs count a null
  key as missing, so re-saving an older card isn't a change (new test). Checked locally on
  desktop and phone. Not deployed. Next: step 4 (the other list pages, Messages builder,
  Insights tabs, Settings access, templates gallery).
- 2026-11-16: Redesign v2, step 4 (the rest) done except Settings access. List pages
  (Suggestions, Starboard, Voice rooms beside self-saving settings; Stream alerts tiles; a
  list head per raid board; Game accounts roster), Messages (library with filters, an editor
  that saves itself with a Post now toolbar), Insights (tabs, range pills, stat tiles with
  sparklines; fixed the download line printing its own code), server templates as cards.
  Checked locally on desktop and phone. Not deployed. Left for later: editing on the
  Discord preview, Insights moderation and safety tabs, a ready-made template gallery.
  Next: Settings access (Viewer / Editor for people or roles), waiting on the owner's
  go-ahead, then step 5 (landing page).
- 2026-11-16: Settings access built (redesign v2 step 4's last piece). Managers give a person or
  a role Viewer (every page, changes nothing) or Editor (settings and posting) on Settings;
  grants are a settings module (`access`, migration 0064) with history and undo, and only a
  manager can undo one. `checkGuildAccess` takes the level each action needs (editor by
  default); requests that act on members or the server need a manager on the dashboard and in
  the bot, which now accepts editors for the rest. Shared servers show under "Shared with
  you" and in the switcher; viewers and editors see a note and what they can't do disabled.
  Tests: access rules, the table's grants, undo refusal, the bot running an editor's raid and
  refusing their lockdown. Checked locally as a manager, a viewer (by role) and an editor (by
  name), including forged posts. Not deployed.
- 2026-11-16: Redesign v2, step 5 (landing page) done. The hero leads with a "Build me a…"
  box and idea chips; `/build` holds the text in a 30-minute cookie through sign-in, the server
  list asks which server to build it in, and the AI assistant opens with it written in, not
  sent. "One bot instead of five" puts the AI assistant first, then Insights (stat tiles with
  sparklines) and Run it from Discord (the command picker, real commands); Overview, Anti-raid
  and the three steps are gone. A scrolling wall of eight ideas, each a link into the same
  hand-off, and a help row (/health, status, support email) after the FAQ. Tests for the
  prompt cleaning and the cookie packing. Checked locally on desktop, phone and light theme,
  signed in and with direct requests signed out. Not deployed.
- 2026-11-16: Deployed redesign v2 (`3989146`, run 43794232829: preflight, slash commands,
  dashboard and bot all passed). Production had 0063 already; 0064 applied first through the
  Supabase connector (table, grants and policies checked: the bot reads, only the dashboard
  writes; drizzle log at 65). The preflight now stops a deploy while `dashboard_access` is
  missing. Live: garrisonbot.com shows the new sections, its `form-action` allows the
  dashboard host, `/build` sets the `__Host-` cookie and hands on to the server list, which
  asks to sign in; /healthz and /status answer, and the new bot container started at 02:50 UTC
  and is beating.
- 2026-11-16: Redesign v2 step 6, menu and page clarity. The menu has icons, finer groups
  (Safety, Welcome, Engagement, Community, Gaming) with the AI assistant near the top, and a
  dot per module for on or off. Every module page says at the top right whether it runs: the
  module's own switch (six pages, saving with Undo) or what's set up and the first thing to
  do (nine pages). Garrison's recommended choices and numbers are marked, with "Use it" to
  go back to them. Checked on desktop, phone and light theme; 588 tests pass. Not deployed.
- 2026-11-16: /impeccable critique across all pages (dashboard 26/40, landing 23/32; snapshot
  in apps/web/.impeccable/critique) and every finding applied, in six commits: true module
  state (on, needs you, off) shared by the menu, page heads and Needs attention, with Live from
  the heartbeat; emergency tools first on phones; one folded Pro group per card editor;
  consistent patterns and plain history; layout fixes; landing fixes. 588 tests pass; checked
  on desktop, phone and light theme. Not deployed.
- 2026-11-16: /impeccable colorize and animate across all pages, and a "Watch it work" section
  on the landing page with three GIFs recorded from the dashboard (about 200 to 310 KB each,
  in apps/web/public/media; re-record with apps/web/scripts/record-gifs.mjs). The public site
  now serves /media and /art itself. 588 tests pass; checked on desktop and phone. Not deployed.
- 2026-11-16: Deployed `2e2b93f` (run 43918628506, dashboard only; no bot change, no migration).
  Live: Watch it work and its GIFs on garrisonbot.com, served from the public site itself;
  /healthz and /status answer. Member pages proposed in docs/MEMBER_PAGES.md.
- 2026-11-16: Member pages, first build (owner's picks: You and Your record). "Servers you're
  in" on the server list opens a member's own space in each server (`/play/[guildId]`, tabs):
  You (level, place, their rank card as /rank draws it with the details it asks for, the
  leaderboard) and Your record (their own cases, who acted left out, the appeal link), beside
  Groups and raids. Settings → Member pages (a manager's, with history and undo; migration
  0065 `member_pages`, dashboard-only grants). Checked as a plain member and as the manager on
  desktop and phone. Not deployed.
- 2026-11-16: Community requests planned (`docs/COMMUNITY_REQUESTS.md`), owner picked the
  order. Server stats built: a page under Community with counters (members, people, bots, a
  role's members, boosts, channels, roles), names with {count} and {role}, Garrison's own
  channels or ones the owner picks, and a Discord channel-list preview; the bot keeps the
  numbers current within Discord's rename limit and removes the channels it made. Migration
  0066 (`stats_settings` edited by the dashboard, `stat_channels` kept by the bot). Free 3,
  Pro 10 counters. Not deployed.
- 2026-11-16: Regex moderation built: Patterns on Moderation (Free 3, Pro 10) with always-allowed
  words, a tester and Discord's answer; the bot keeps one Discord AutoMod keyword rule in step
  (`automod_rules`, migration 0067) and makes each block a case with the automod action. Not
  deployed.
- 2026-11-16: Verification questions built: an intro (Markdown) and up to five questions in
  Discord's form from the Verify button and on the website verify page, answers to a staff
  channel as a card, instant or staff-approved (card buttons, or a manager's request from the
  Security page's waiting list), kept 30 days. Migration 0068 (`verify_answers`, the bot's to
  write; question columns on `gatehouse_settings`; `verify_decide` request). Not deployed.
- 2026-11-16: Deployed `7849b5a` (run 43974339633, everything): member pages, server stats,
  regex moderation, verification questions. Migrations 0065 to 0068 applied in production
  with their log rows; preflight passed; the new bot started 22:57 UTC.
- 2026-11-16: Messages into threads and forum posts built: grouped destinations (channels,
  forums, open threads), a thread by link, forum post title and tags, and updating a posted
  message by its link. No migration. Not deployed.
- 2026-11-16: Invite tracker built: an Invites page (every invite, joins and week stays per
  invite and category, labels with color, description, category and a join role, tracking a
  pasted invite) and Partners (partner server, contact and deal per invite). Migration 0069
  (`invite_settings`, settings module `invites`). Not deployed.
- 2026-11-16: Shared Insights built: a manager-made read-only link (counts and charts, no
  names), optional embedding in other sites, replace or stop at any time. Insights' body moved
  into `components/insights/InsightsView.tsx` for both pages. Migration 0070
  (`insights_shares`, dashboard only). Not deployed.
- 2026-11-16: Economy designed (`docs/ECONOMY.md`): earning, a shop of roles and staff-handled
  items, wallets on member pages, a ledger, no gambling. Waiting on the owner's picks.
- 2026-11-16: Economy built (owner's picks: paying with a daily cap, Free 10 / Pro 50 items,
  "Economy"): a currency with its own name and icon; coins for chatting, /daily with a streak,
  voice and level-ups (Pro); /pay, /balance, /shop, /buy, /money, /leaderboard by coins; a shop
  of roles (timed on Pro, refunded if Discord refuses) and staff-handled items (a card with Done
  and Refund); an Economy page and a member Wallet. Money moves lock the wallet; balances can't
  go below zero; the bot alone moves money. Migration 0071. Not deployed.
- 2026-11-17: Deployed `eb9c6a1` (everything, commands registered) with migrations 0069 to 0071.
  **Outage:** the bot stopped sending heartbeats at 23:43 UTC and the new container stalled in its
  first sweep twice (23:48, 04:17); nothing restarted it because the health check only sees the
  Discord connection, and the bot started its timers only after the first sweep finished. Fixed in
  `3f76d1b` (deployed 04:26): every sweep step has a 45-second limit and is logged by name when
  stuck, the timers start at once, and the heartbeat has its own timer. Back at 04:26:44, first
  sweep done in 5 seconds. Which step stalled isn't known: the Cloudflare container logs for
  23:44 to 04:26 would say ("Sweep step is stuck" appears only from 3f76d1b on).
- 2026-11-17: Follow-ups from the owner. The AI request that "failed to respond" at 02:19 was the
  outage above (it expired at 04:26 unanswered). Server Stats now lists all counters as options.
  An "@" picker (`TemplateField`) inserts placeholders in every template box. The AI assistant
  gained orders: a plan can reorder categories, the channels in one category, and roles, by
  swapping the listed items among the places they hold now. Roles with staff powers, app roles
  and roles at or above Garrison's never move, and no role may pass one (checked in the plan and
  again against Discord at apply time); Undo restores the old order; removing an item from a
  draft keeps its orders. Its instructions now cover Discord's sidebar order, text above voice,
  the role hierarchy and permission overwrites. Migration 0072 (local only). Not deployed.
- 2026-11-17: Deployed `eba3caf` (everything, no command changes) with migration 0072, applied
  and recorded first (73 rows). The new bot started at 05:19:44 UTC and is beating.
- 2026-11-17: Landing recordings redone. The GIFs' pointer jumped because each screenshot took
  longer than the 90 ms between them. New clips come from a 60 fps screencast at 2x; the pointer,
  its click ring and the camera (push in on the action, pull back to show the result) are drawn
  per frame from a timeline, then encoded with x264. Shown the way PeakBot does it, in our own
  style: a row per clip, video beside the copy, alternating sides, lazy and play-in-view. Not
  deployed.
- 2026-11-17: Landing clips remade in HyperFrames in the style of the promo ads (PeakBot-like
  glow, sheen and camera, Garrison's colours). Same file names, posters from each end state;
  the frame lost its fake browser bar. Not deployed.
- 2026-11-17: Deployed `174c9f3` (dashboard): the new landing clips are live on garrisonbot.com
  (served files match the build byte for byte).
- 2026-11-17: Layout audit of every dashboard page (desktop and phone captures, DOM structure,
  measurements, the impeccable layout scan, which was clean) and a proposal in
  `docs/LAYOUT_PROPOSAL.md`. Nothing built yet.
- 2026-11-17: Layout phase A (`b5a5996`): the menu scrolls inside the rail, Needs you is one
  strip, fields are sized to content, Leveling's and Game accounts' rows show one spare with Add.
- 2026-11-17: Layout phase B: page tabs on the ten pages with several jobs, and the Activity and
  Setup templates. Moderation's Cases tab is 946px tall at 1440 (3,637 before). LFG templates
  became a tab of Groups and raids; Settings lost Your account and "Inside other pages". Checked
  every tab at 1440 and 390 (no sideways scroll) and in Chrome: switching in place, Back, a
  #section link opening its tab, the old templates address. 101 web tests pass.
- 2026-11-17: Layout phase C: Compact pages, library editors on a page of their own, one-sentence
  intros with "How this works", the page-head layers merged. Checked at 1440 and 390, and in
  Chrome: tile, editor, back to the tile on all four library pages. 101 web tests pass; lint at
  36 warnings (37 before).
- 2026-11-17: Layout phase D: the regrouped, folding menu; the Overview in four bands (1,476px
  at 1440, 1,759 before); the phone head (first panel about 180px down); four breakpoints;
  DESIGN.md updated. Checked every page at 1440 and 390 (no sideways scroll), key pages at
  1000 and 600, and in Chrome: folding kept across a reload, the search icon, the section tag
  on each page. 101 web tests pass; lint at 36 warnings.
- 2026-11-17: Layout, the rest of the proposal: Logs' events table full width (inviters and the
  download under it); AI assistant's Server templates is a tab; Economy's Activity tab puts Give
  or take beside the lists; Welcome's Join tab is one column (card, image, roles on join); spam
  and raid rules read as sentences; eleven help texts cut to two lines with "How this works";
  Voice rooms and Server stats say a missing permission in the head with a "Give …" button to
  Discord, not a banner. Checked at 1440 and 390 and in Chrome; production build passes; 101
  web tests pass; lint at 36 warnings.
- 2026-11-17: Optimize and polish (impeccable), measured on a production build. Every dashboard
  page runs 15 fewer database queries: the menu's sixteen module settings are one query
  (`readManySettings`), so the session check no longer queues behind them (Settings 28 to 13
  queries, about four round trips instead of eight). AI assistant's largest paint on a slow phone
  2.1 s to 1.0 s (the conversation no longer animates in); Settings' layout shift 0.051 to 0
  (auto-save's fallback row is hidden for scripts from the start). Optional `CF_PLACEMENT_REGION`
  pins the Worker beside the database (Supabase is in us-west-2; the Worker ran in Dallas).
  Polish: all controls at least 24 px on phones, hex color fields named, light-theme change badges
  above 4.5:1, a pending bar on library tiles, the legal summary without its side stripe, about
  220 lines of unused CSS removed.
- 2026-11-17: The bot's hiscores tests use fake timers: four lookups spaced 1.5 s apart had
  outlasted the 5 s test limit. All 258 bot tests pass.
- 2026-11-17: Fix: the AI assistant showed "This page couldn't load". The dashboard ran out of
  database connections (Supavisor session mode allows 15 for garrison_web): while a chat
  request waited, the page refreshed itself every 1-2 s and each refresh re-prefetched all 20
  menu pages, every one a full render with its queries. Menu links and library tiles no longer
  prefetch (a pending bar shows while their page loads). The bot's request loop had also
  stalled since a pass hung on a database call that never answered (a 16-hour-old bot query
  was still open); a pass now gets 3 minutes before the next tick starts a fresh one.
- 2026-11-18: Fix: the bot went silent for 11 hours (last heartbeat 03:51 UTC) and the AI
  assistant never replied. Its database pool hung on connections that stopped answering; every
  query, the heartbeat included, waited behind them forever, while `/healthz` kept saying ok
  because Discord was still connected, so nothing restarted it. Now the pool has a connect
  timeout and drops idle connections after a minute, a `select 1` probe runs every 30 s, and
  `/healthz` says 503 after 2 minutes without an answer. After 5 the bot exits and the
  Cloudflare cron starts a fresh one (`apps/bot/src/lib/liveness.ts`).
- 2026-11-18: Fix: dashboard pages said "Nothing here … you don't have Manage Server" when
  Discord rate limited or failed the access check. Discord reads retry once (a 429 waits
  Discord's `retry-after`, up to 2 s; 5xx and no answer on reads only). Only Discord saying the
  person isn't in the server is "no access"; anything else is an error, still fail-closed.
- 2026-11-18: Every page has an error boundary (`components/LoadError.tsx`) instead of Next's
  blank "This page couldn't load": the menu stays, it retries once by itself, then offers Try
  again, with the error's reference for the logs.
- 2026-11-18: AI assistant: a chat message ends within 150 s with "Claude took too long" (all
  rounds and retries), and requests run in a lane per server with AI chat in its own, so a slow
  reply never holds up another server's or the same server's other requests. The page says when
  the bot isn't running instead of showing the typing dots forever, keeps watching for the
  reply until the request expires, and refreshes less often the longer it waits.
- 2026-11-18: The CSP allows exactly `style="display:none"` by hash (`style-src-attr`): React
  puts streamed chart parts in such a holder inside SVGs, which was blocked on Insights.
- 2026-11-18: Speed pass on connections. The dashboard's per-request database clients no
  longer ask Postgres for its array types first (`fetchTypes: false`): that query ran before
  every page's first real one, about 6,800 times in 12 days; Drizzle-mapped columns parse the
  same, and no raw query the dashboard runs returns an array. The bot expires old dashboard
  requests once a minute instead of on every 5 s claim (the queue was ~90% of the bot's
  queries), and the claim never takes one past its 10 minutes. The bot logs when a database
  round trip takes over 300 ms. Checked and left as they are: Claude (every logged call ok,
  replies ~22 s, nearly all of it output; caching reads within a conversation), OpenAI
  moderation, Twitch, YouTube, OSRS, Battle.net, Turnstile and rank-card images (all with
  timeouts), and the per-message handlers (settings cached, nothing read for modules that are off).
- 2026-11-18: `docs/SCALING.md`: every connection limit from Discord to Postgres with today's
  values, what breaks first as servers grow and what to change at each stage (now: lower
  Hyperdrive's connection limit from 60 to 12), and the queries and log lines to watch.
- 2026-11-18: Scaling, first pass (docs/SCALING.md). The bot's minute flush writes the heartbeat
  first and every table in one multi-row upsert (was one round trip per server and per member),
  and never runs two at once. Voice XP is one upsert per server (`awardVoiceXpMany`, same cooldown
  and level-up claim). Health snapshots run three servers at a time. `shards: "auto"` (one shard
  today). Four foreign-key indexes and `operations_prune()` (dashboard requests after 30 days,
  reply times after 90; never a pending one), called hourly: migration 0073, applied in production
  by hand in the SQL editor (the next `pnpm db:migrate` re-runs it harmlessly).
- 2026-11-18: Deployed branch `claude/garrison-dashboard-errors-c0gcd3` (run #50, `everything`,
  no command registration). The bot came back at 18:03 UTC after 14 hours silent and checks in
  every minute; Hyperdrive's origin connection limit is 12 (was 60).
- 2026-11-19: AI assistant: edits and deletes (owner's call; still Claude Haiku 5.5). It sees
  each channel's and category's access, topics, slowmode and kind, each role's permissions and
  members, and the server's Community settings; it can rename, re-topic, move, re-permission
  channels and categories and edit plain roles, all undoable, and delete (permanent, at most
  10, never what Discord or Garrison depends on). Every limit is in the prompt, corrected
  Discord facts, and a refused draft is fixed once from the checker's reasons before the admin
  sees anything (docs/AI_ASSISTANT.md, "Editing and deleting"). Migrations **0074** (edits
  column) and **0075** (bot role: 30 s statements, 10 s locks, 15 s idle-in-transaction, so a
  connection that dies mid-query frees its slot and locks in seconds; it happened about every
  45 minutes on 2026-11-18).
- 2026-11-19: The bot froze 40 to 50 minutes after every start (02:35 → 03:21, 05:44 → 06:29,
  11:17 → …): a connection about 45 minutes old was cut on the way to the pooler mid-transaction
  ("unexpected EOF on client connection with an open transaction"), the pool froze, and the
  watchdog restarted the bot. Its connections now renew every 10 to 15 minutes, each at its own
  time (postgres-js lets a running transaction finish first; checked against Postgres 16). If the
  drops continue, move the bot's DATABASE_URL to the session pooler (port 5432), which Supabase
  recommends for long-running servers.
- 2026-11-19: Planned AI assistant v2 (`docs/AI_ASSISTANT.md`, "Assistant v2"; analysis in `docs/haiku-sonnet-split.html`). Eight phases: a cost ceiling that holds on any model and server size, the Your server workspace (hand edits, Apply build in the panel, history as a tab), a Fast/Smart model picker (Sonnet on Pro and Agency), an eval set, how-to help, server insight, writing content, more modules. Found: the 12,000-token input limit behind every hold isn't enforced. Nothing built yet.
- 2026-11-19: AI assistant v2, phase 1: a message can't cost more than it holds. The planner
  counts every request (`count_tokens`, free) and fits its output, then the conversation,
  inside what's left of the hold; a request that can't fit isn't sent ("not enough supplies
  for an answer that size"). Looks stop when what's left wouldn't pay for an answer, the
  self-fix after a refused draft gets only the remainder, a timed-out request is charged its
  worst case, the SDK's own retries are off (the planner retries only 429/529/5xx), each
  round is priced at the model that ran it (Sonnet's cache reads at its real 0.05x), and an
  unpriced `QM_MODEL` stops the bot at start. 710 tests pass. Not deployed.
- 2026-11-19: AI assistant v2, phase 2: the Your server workspace. The right panel is always
  Your server, with Apply N changes (then "Building X of N") and Discard at its top right.
  Rename any channel, category or role in place, drag to reorder categories, a category's
  channels and roles below Garrison, drag a channel onto another category to move it, or use
  Move up / Move down. Each hand change goes to the bot as a `qm_edit` request, is checked
  against the server, lands in the person's draft as the next version (or starts one), costs
  no supplies, and survives an AI redraft. The tree shows renames (old name in Now), moves and
  deletions in place; a change Discord overtook is listed with Keep and Drop, and Apply waits.
  Build history and the requests list moved to a History tab. Fixed: "Remove from plan" lost
  a draft's edits. Migration **0076**. 732 tests pass and the dashboard builds; not checked in
  a browser (needs the local Docker stack). Not deployed.
- 2026-11-19: AI assistant v2, phase 3: Fast or Smart. A switch under the composer picks Haiku
  (Fast, every plan, about 3 supplies a message) or Sonnet (Smart, Pro and Agency, about 45),
  with "about N messages left" for the choice and a one-time check before the first Smart
  message. Both charge their real price through the phase 1 ceiling. Smart runs without the
  refusal fallback so a message never holds twice its worst case. The reply keeps its model
  (migration **0077**) and the chat shows "Smart" on it; a conversation keeps the model it last
  used. While it replies, the chat shows what it's doing (reading the server, looking at a
  page's settings, checking the draft). Past conversations open from a list beside New
  conversation. New bot setting `QM_SMART_MODEL` (default `claude-sonnet-5-5`). 736 tests pass
  and the dashboard builds; not checked in a browser. Not deployed.
- 2026-11-19: AI assistant v2, phase 4: an eval set and reply ratings. 43 hand-written cases on a
  fixture server (design, edits, questions, settings, posts, how-to, writing, refusals,
  injection), graded by code on drafted right, valid, on task and safe, through the real
  planner with the production hold. CI checks the eval itself (every reference passes, empty
  answers and a server wipe fail). `pnpm --filter @garrison/bot eval` shows the cost and runs
  with `--yes`; not run yet (no API key here). Thumbs up or down under every reply, with a
  note on a thumbs down (migration **0078**: three columns, the dashboard may write only
  those); `eval:collect` pulls thumbs-down replies to review as new cases. 743 tests pass and
  the dashboard builds; not checked in a browser. Not deployed.
- 2026-11-19: AI assistant v2, phase 5: how-to help. One help file (`packages/db/src/help.ts`, 29
  features: what each does, its page, how to set it up, its commands, and Free and Pro limits
  read from the real feature list). The assistant looks things up with a new `garrison_help`
  tool instead of guessing pages, commands or limits, and how-to answers can list steps. The
  dashboard has a Help page with the same text (menu foot, and in search). 747 tests pass and
  the dashboard builds; not checked in a browser, and the eval hasn't run on the real models.
  No migration. Not deployed.
- 2026-11-19: AI assistant v2, phase 6: server insight. A `server_insight` tool answers how the
  server is doing from the dashboard's own numbers: activity (a week, a month, or a year on
  Pro), moderation cases as counts by action and source (never who they were against),
  the ticket queue (and stats on Pro), the health check's problems, the leveling top 10, and
  upcoming raids, giveaways and open groups. Answers give the number and its period and never
  guess. 8 new eval cases (53 in all). 748 tests pass and the dashboard builds; the eval hasn't
  run on the real models. No migration. Not deployed.
- 2026-11-19: AI assistant v2, phase 7: writing. A plan can write the welcome, leave and DM
  cards and new or rewritten saved messages (at most 3 texts), shown in full in Your server as
  Discord renders them, with what each replaces. They're checked by the card and Messages rules,
  saved through Settings history (Undo puts the old text back), and a plan can post a message it
  writes. It writes in the server's voice and leaves [blanks] instead of inventing facts.
  Migration **0079**. 754 tests pass and the dashboard builds; not checked in a browser, and the
  eval hasn't run on the real models. Not deployed.
- 2026-11-19: AI assistant v2, phase 8A: more settings, and forum and announcement channels. A
  plan can now set anti-raid and verification (never anti-nuke), the time zone and attendance,
  voice XP, appeals, the whole warning ladder and level rewards (with roles it makes), each to
  its page's own ranges and plan limits. New text channels can be forums or, on Community
  servers, announcement channels. 6 new eval cases (60 in all). 757 tests pass and the dashboard
  builds; not checked in a browser, and the eval hasn't run on the real models. No migration.
  Not deployed. 8B (whole new items: role menus, ticket panels, alerts, giveaways, economy,
  templates, invite labels, stats counters) is planned in docs/AI_ASSISTANT.md.
- 2026-11-19: AI assistant v2 checked in a browser (local dashboard against a fresh Postgres with
  all 80 migrations, which apply cleanly, and the e2e stand-in for Discord; no bot running). The
  Your server panel, Apply N changes and Discard, renames and moves in place, the announcement
  channel detail, the write preview, the Smart badge, line breaks, thumbs, the History tab and
  Help all render. Fixed: the row's details link covered the pencil and Move buttons (clicks
  opened details instead), the Fast/Smart switch ran under Send, and "Saving…" squeezed the
  panel head. A rename and a move were queued as `qm_edit` requests with the right payloads; the
  bot side of them is covered by tests, not run here. The console's inline-style CSP messages
  come from the Next dev server (they show on the new Help page too); the production-build CSP
  check is the e2e suite's.
- 2026-11-19: AI assistant 8B, part one: the assistant makes new role menus and ticket panels
  (with their staff roles), checked by the pages' own checks and postable in the same plan. Lint,
  type-check, 759 tests and `next build` pass. Not deployed.
- 2026-11-19: AI assistant 8B finished: stream alerts, the economy and shop, LFG templates,
  invite labels and server stats counters as settings whose lists add items (checked whole by
  each page's own check, re-checked when applied), and new giveaways started through the
  dashboard's own request. Lint, type-check, 763 tests and `next build` pass. Not deployed.
- 2026-11-19: Deployed `9c003e1` from `claude/garrison-dashboard-errors-c0gcd3` (run #54,
  `everything`, no command registration). Migrations 0076 to 0079 applied in production first;
  0073 to 0075 were already applied but unrecorded, so 0073 to 0079 were recorded together (80
  rows, one per migration file). Preflight passed; the new bot started at 22:41:46 UTC and is
  checking in.
- 2026-11-20: AI assistant replies weren't arriving: 7 of the last 8 chats since 2026-11-17
  expired ("Garrison didn't get to this in time") before the bot even saved the message. The
  bot's queries hang on a connection the network dropped silently (a garrison_bot statement
  stuck at PARSE until the 30 s timeout at 00:06:05 UTC, then a watchdog restart), and nothing
  noticed while the heartbeat still got through on another connection. Fix (`3ec2a9f`): the
  database client replaces its pool when any query waits over 60 s, failing the stuck ones
  (packages/db watchdog.ts, tested live against Postgres), and each dashboard request has a
  deadline (6 min for AI, 2 min otherwise). Deployed bot-only from branch `deploy/retry-cf`
  (run #56). Cloudflare kept answering 100146 ("version could not be found") right after
  uploading; three failed attempts (run #55) took the bot down from 00:44 to 00:56 UTC, and
  the workflow now retries only that error, 30 s apart (`d9d31f3`). The engine is named
  Bastion v1 in the picker, on replies, in Help and in the prompt (`3b82001`).
  Still to do: confirm a real chat answers, and run the eval on real models (needs a key).
- 2026-11-20: Deployed `1e0fe76` (run #57, `everything`, no command registration): Bastion v1
  naming and the deploy retry, on top of the hang fix. No 100146 retries were needed; the new
  bot started at 01:06:44 UTC and is checking in.
- 2026-11-20: The AI assistant answers again, tested for real on the owner's server from the
  dashboard. Three faults, each hiding the next:
  1. Since `c24525e` (2026-11-18) the bot's request claim put a JS Date into raw SQL;
     postgres-js threw before sending it, so no dashboard request was ever picked up (PGlite in
     the tests accepts a Date). Fixed in `730c25e`, with the weekly backup check and a ticket's
     first staff reply; createDb now turns any Date into ISO text.
  2. The chat's structured-output schema had 25 nullable fields (the API allows 16): a 400
     before the model ran. `8525721` cut it to 3 with "not set" values (wire.ts).
  3. Then "The compiled grammar is too large": the plan left the grammar (`a15d45c`). The
     answer is reply, quick replies and plan_json; the plan's shape is in the cached
     instructions and checked on the way in, a bad one going back to the model once.
  Also: up to 12 reorders and channels outside any category (`08b5a1f`); a 4xx from the AI
  service now says what it said; messages say Bastion. Results in production: a Fast question
  answered correctly in 8 s for 3 supplies; a Smart "clean up and reorder" drafted 6 orders
  (categories, channels in four categories, roles) in 18 s for 74 supplies. Not applied.
  Deployed bot-only runs #58 to #60.
- 2026-11-20: Pricing re-check for a 50%+ margin on both models (docs/pricing.md). A supply is
  $0.001 of AI on Fast or Smart alike, so a pool's worst case doesn't depend on the model; Smart
  just uses it 20 to 25 times faster (45 to 75 supplies a message against 2 to 3). Yearly plans
  were at 52% worst case, and a message whose plan Garrison refused was free, which let a pool
  spend AI it never counted. Owner chose: charge those messages their AI (not their changes),
  pools Pro 2,500 and Agency 11,000 (from 3,000 and 13,000), packs 800 and 4,000 supplies at
  the same prices, and plan cards in supplies only. Worst case is now 59%+ on every plan and
  pack before hosting. Pack sizes go on the Checkout session so a pack bought mid-change gets
  what it said. Lint, type-check, 779 tests and `next build` pass. Deployed `118d863` (run #61,
  `everything`); the live Plan page shows 2,500 / 11,000 and packs of 800 and 4,000, and the
  new bot started at 02:32:44 UTC.
- 2026-11-20: Landing refresh. Hero: Add to Discord, Open dashboard, See it in action (which now
  goes to "Watch it work", the section it names). Watch it work: a new first clip, the AI
  assistant (type a request, pick Smart, the reply, Your server marking the Valorant category,
  three channels and Gold+ as New, Apply 5 changes, "Applied: 5 changes made."), then Write it,
  Fix what needs you (was first), It saves itself. All four clips were remade from the real
  dashboard: `promo/landing/real/` (outside git) snapshots each page's finished DOM and the
  dashboard's CSS and fonts from the local preview (`dump.mjs`, with a preview session cookie),
  stacks them in the HyperFrames stage and animates between them (`build.mjs`, then
  `hyperframes render --fps 60 --crf 21` in each clip folder, re-encoded at CRF 24 with
  faststart: 1.8 to 3.1 MB each). Landing mockups redone against the real pages: the AI
  assistant is now the page's chat, the Bastion v1 Fast | Smart picker and the Your server panel
  with marked changes and Apply, in a full-width row (`components/AssistantShot.tsx`, the
  dashboard's own classes); the hero's Lockdown card has its header badge, duration bar and
  reason field; Insights has the tab bar, the range pills and four tiles in the page's own
  words; the ladder has its help line; the group card has Join. Product windows take their
  page's accent, as the dashboard's shell does.
- 2026-11-20: Needs attention checked with every kind of problem seeded on the preview (lockdown,
  quarantine, failing health check, waiting plan, short raid, four blocked modules, a stuck and
  a failed request): the right ones show, alerts first. Links fixed: a blocked module now goes
  to the field that fixes it (the page's `#section`, which opens its tab: Moderation log to
  Escalation and appeals, Logs to Setup) or to Discord's permission page, with the page's own
  words ("Pick a channel", "Give Move Members"); the raid goes to the Raids tab, lockdown and
  quarantine to their panels (Quarantined got an id), and request kinds that had no page
  (economy, templates, AI hand edits, seasons, verification answers) now have one. The plan
  line says "applies" instead of "builds". Restyled with the impeccable polish pass: a header
  bar with a warning tile, "3 happening now · 5 not working · 3 to look at", marks by shape
  (filled triangle now, outlined triangle broken like the menu, ring waiting), the fix as a
  quiet button, most urgent first, five rows shown and the rest behind "Show N more". DESIGN.md
  has the rules. Biome (only four untouched CRLF files fail format, as before), type-check,
  779 tests from the repo root and `next build` pass. Not deployed.
- 2026-11-20: Deployed `db83944` (run #62, `dashboard`, no command registration). garrisonbot.com
  shows Open dashboard and the AI assistant clip first; the served clips and posters match the
  build byte for byte.
- 2026-11-20: Your account redone (`/account`, `app/account/export`, `packages/db/src/repo/account.ts`).
  Four page tabs instead of one long page: Game accounts, Servers, Billing (only for someone who
  pays) and Privacy. New: sign-ins with "Sign out everywhere else"; "Download your data" (one
  JSON file of everything that's the person's own: links, shares, rank card details, levels,
  wallets, entries, sign-ups, suggestions, appeals, plans, AI use); "What Garrison keeps";
  "Erase your data" (links removed and wiped, every share stopped, rank card details cleared,
  signed out everywhere; server records stay with each server, by email on request). Removing a
  link (web, bot, or a Connections re-sync) now wipes its display name and details instead of
  only hiding the row. Agency owners get Manage billing on Account. The member's You page lists
  "Your game accounts here". `account.test.ts` runs it all as `garrison_web`, so the dashboard
  role's grants are proven. Checked in the local preview at desktop and phone width. Biome (the
  untouched CRLF files fail format as before), type-check, 783 tests and `next build` pass. Not
  deployed.
- 2026-11-20: Release-readiness audit, competitor comparison and AI cost model (artifact
  https://claude.ai/artifact/UwdHSC75CbQ1C84eFH7eD3). Must fix: sales tax decision, support mail,
  Discord portal (Public Bot is off), a verification plan for 75 servers, CI that never runs on the
  default branch and a deploy that runs no checks, no alerting, Supabase backups and size, the
  real-server release test, the first AI eval run, a legal read, purging removed links, Turnstile.
  AI for 1,000 server owners: 70 to 78% margin expected at 5 to 10% Pro, 15 to 42% if every pool is
  spent; Free is the swing cost, break-even about 3.9% conversion in the worst case.
