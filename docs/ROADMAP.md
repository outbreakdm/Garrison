# Roadmap: Garrison Pro and the all-in-one bot

The running plan for paid plans (Stripe), deeper customization on every feature, and
the new modules that make Garrison an all-in-one bot. Whoever picks this up next (a
person or a Claude session) starts at **Pick up here**, does the next unchecked step,
then updates **Status** and the **Log** before stopping.

## Pick up here

- **Now:** Phase 1, plans foundation. Next: the dashboard **Plan** page, then the staff page.
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
| 1 | Plans foundation: one feature list, one entitlement check, owner bypass, comps, Plan page | **Started** |
| 2 | Stripe in test mode: Checkout, customer portal, webhook, then live keys | Not started |
| 3 | Shared card editor (field editor + live preview + Pro-locked styling) | Not started |
| 4 | Role menus (first module on the card editor) | Not started |
| 5 | Bot profile per server (name, avatar, banner, bio, card colours) | Not started |
| 6 | Welcome (messages, leave messages, roles on join) | Not started |
| 7 | Tickets / modmail | Not started |
| 8 | Message builder (post now or on a schedule) | Not started |
| 9 | Custom rank cards with character details | Not started |
| 10 | Stream and video alerts (Twitch, YouTube, Kick) | Not started |
| 11 | Giveaways and starboard | Not started |
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
- [ ] Apply migration `0022_plans_comps` to production and add the owner's row to
      `platform_staff` (owner runs the SQL; see Owner bypass above).
- [ ] Dashboard **Plan** page per server: current plan, the Free vs Pro table from the list.
- [ ] Staff admin page: every server's plan; give or remove a comp.

### Phase 3: shared card editor

- [ ] Dashboard component: edit a card field by field (title, text blocks, buttons, colour,
      image), live preview drawn like Discord (dark theme, accent bar, sections, buttons).
- [ ] Pro-locked controls with a Pro tag; preview shows them, save refuses them on Free.
- [ ] The saved shape is the `Card` type from `apps/bot/src/lib/card.ts`, moved to a shared
      package so bot and dashboard use one definition.

Later phases get their checklists when they start.

## Depth for current modules (backlog)

- **Watch:** [ ] automod (spam, invite links, mass mentions, word lists) · [ ] mod notes on
  members · [ ] appeals form on the dashboard feeding a queue · [ ] temporary bans that lift
  themselves
- **Gatehouse:** [ ] captcha verification on the website · [ ] alt-account warning signs ·
  [ ] full server backup and restore (channels, roles, permissions)
- **Ledger:** [ ] invite tracking · [ ] voice joins and leaves · [ ] nickname changes ·
  [ ] CSV export
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

- **Price** for Pro per server (Dyno and Carl-bot sit around $5 a month).
- **Message content in logs:** the Message Content intent is on in the Developer Portal but
  the bot doesn't request it, and the site promises message content is never stored.
  Automod can read text without storing it. Storing deleted/edited text in Ledger would
  change that promise (copy on the landing page, Ledger page, README) and needs Discord's
  approval for the intent past 100 servers.
- **Free backups:** is one manual backup enough on Free, given restoring after a nuke is safety?

## Log

- 2026-11-11: Roadmap written. Discord messages moved to Components V2 and deployed
  (commit `1aed992`). Phase 1 started.
- 2026-11-11: Plan feature list (`packages/db/src/plans.ts`) and tests added; Rally reads its
  limits from it. Type-check, all tests and Biome pass. Committed `6504bbf`.
- 2026-11-11: Staff and complimentary plans in the database (migration 0022, repo, tests).
