# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: owners and admins of Discord gaming communities, the people with Manage Server who add Garrison and run it. They keep their server safe (moderation, raids, rogue admins), set up how members find groups and sign up for raids, and change the server's channels and roles. They manage from a browser, often on a phone between other things, and need to see quickly what needs them.

Secondary: players and members. Today they use Garrison in Discord (join groups, sign up for raids, check their rank, link game accounts on the Account page). Member pages on the dashboard are an open decision (see Capabilities).

## Product Purpose

Garrison is moving from "a Discord bot with a dashboard" to "a dashboard, with a small bot in Discord". The website is where a server is run; the bot does the work in Discord and keeps a few commands for convenience. Success: an owner opens the dashboard, sees what needs attention, fixes it there, and never has to remember a settings command.

## Positioning

One dashboard runs the whole server: moderation, security, logs, LFG, raid signups, ranks and an AI server builder, with nothing Discord-only for managers. Every change can be undone. The dashboard never acts in Discord itself: it queues a request, and the bot checks it again before doing anything. Everything a server needs to stay safe is free.

## Operating Context

- Discord servers for gaming communities (raids, ranked squads, casual groups, multi-game clans).
- Sign-in with Discord; the dashboard shows servers where the person has Manage Server and re-checks permissions on every page.
- Public pages: the landing page (`/`, served on garrisonbot.com) and `/status`. The dashboard lives at dash.garrisonbot.com in production.
- Invite flow: "Add to Discord" asks for exactly the permissions Garrison uses, never Administrator.

## Capabilities and Constraints

- Modules are named plainly on the dashboard (decided 2026-11-12): Moderation, Security, Logs, Welcome, Role menus, Tickets, Leveling, Giveaways, Starboard, Stream alerts, Messages, Groups and raids, Game accounts, AI builder. The themed names (Watch, Gatehouse, Ledger, Herald, Insignia, Parley, Ranks, Spoils, Honors, Beacon, Dispatch, Rally, Ops, Barracks, Quartermaster) live on only in URLs, code and search keywords. All are built.
- Watch: numbered cases, escalation ladder, undo on every action. Gatehouse: anti-raid lockdown that restores every channel exactly, verification, owner-only anti-nuke that quarantines a rogue actor. Ledger: who did what and when, 7 to 365 days, with the text of deleted and edited messages only if the server turns it on. Parley (tickets): private ticket channels with transcripts kept 30 days after closing (365 on Pro), a queue and staff notes on the dashboard. Rally: LFG cards with role slots, a private voice room when the squad fills, per-game templates. Ops: raid rosters with caps, a bench that promotes itself, reminders. Ranks: XP off by default, rewards can't carry admin powers. Quartermaster: describe channels and roles, review the plan as a preview of the server, apply; additive only, versioned, undoable.
- Limits are written down: logs retention, XP rate, 3 AI plans a day per server (15 on Pro), 20 changes per build, plans expire after 15 minutes, 25 scheduled raids per server.
- Technical: Next.js on Cloudflare; a strict CSP (no inline styles; images only from the site, `data:` and `cdn.discordapp.com`); the repository is public, so no real IDs, tokens or names in source.
- Copy rules: plain words, no labels above headings, say what happened and what to do next; settings live on the page they affect.
- Undecided: member pages for people without Manage Server (phase 4 of `docs/DASHBOARD_FIRST.md`); whether settings slash commands are removed or reply with a dashboard link.

## Brand Commitments

- Name: Garrison. Tagline: "Guard the gate. Rally the squad."
- The shield mark (`components/Logo.tsx`) and the module names above with their plain labels.
- Bot embeds in Discord use the status colours from `packages/brand` (go, caution, alert, intel) for moderation and alerts only, never decoration.
- The landing page is getting a new visual world (decided 2026-11-11): the category-standard Discord-bot page, played straight, at the craft of Linear, Vercel and Raycast, and sitting comfortably beside MEE6, Dyno, Carl-bot and Discord's own site. The dashboard keeps its current look for now; following later is an open decision.

## Evidence on Hand

- Live numbers from `/status`: command reply time (p95, 24 h), 30-day uptime, last heartbeat. Use only when present; the landing hides them when there is no data.
- The real product: dashboard pages, Discord embed and card wording from the bot, the Quartermaster server preview.
- Site art in `apps/web/public/art/`, prompts in `apps/web/art/slots.json` (night outpost world, volt light).
- Pricing: free during early access; paid plans will be published with every price and limit before anything costs money.
- Absent, never to be invented: server or member counts, testimonials, customer or community logos, benchmarks beyond `/status`, published prices.

## Product Principles

1. Nothing is Discord-only for managers: the dashboard is home.
2. Every change can be taken back, and undo removes only what it added.
3. Safe by default, and free.
4. Nothing hidden: every limit is written down.
5. Least privilege: ask only for what is used, re-check before acting.
