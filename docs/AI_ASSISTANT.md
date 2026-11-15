# The AI assistant: one currency, dashboard tools

Drafted 2026-11-15. Owner decisions so far: the currency is called **Supplies**; a change
costs 1 and a message costs 3; the AI may change settings and post role menus, ticket panels
and saved messages, but never moderate. Built in phases, each shippable on its own.

## What changes for the owner

Today the AI builder only adds channels and roles. With this, an admin can ask for anything
the dashboard does, in plain words, and get it done in the same chat:

> **You:** turn on automod and block scam links, and log deleted messages to #mod-log
>
> **Garrison:** Done as a plan: Automod turns on with scam links blocked, and Logs keeps the
> text of deleted and edited messages in #mod-log. 3 supplies. Build it?
>
> *[preview: Automod · Off → On · Scam links: Allowed → Blocked · Logs · Keep message text:
> Off → On · Log channel: none → #mod-log]* **[Build v4]**

> **You:** is leveling on?
>
> **Garrison:** Not yet. Turning it on gives members XP for chatting, once a minute at most.
> Want me to turn it on with level-up messages in #general? *[Turn it on] [Not now]*

Everything still works the way plans work now: Garrison proposes, the admin sees exactly what
changes, nothing happens until they build it, and every build can be undone.

## Supplies: one daily currency

| | Free | Pro | Agency |
|---|---|---|---|
| Supplies a day | 40 per person, across all their Free servers (and 40 per server) | 300 | 400 on each server |
| That's about | 1 full plan, or 13 messages | 13 full plans, or 100 messages | 17 full plans, or 133 messages |

A full plan is 23 supplies: the message that drafts it (3) and its 20 changes. The table's
first draft counted 20 a plan; the page and pricing show the honest 23.

**What costs what**

- **A message to the assistant: 3.** Asking, answering a question, or drafting a plan. It's
  the only part that costs real money (an AI call), so it's priced higher.
- **A change: 1.** Each channel, category or role a plan creates, each setting a plan
  changes (one per field: "Automod On" is 1, "Scam links Blocked" is 1), and each post.
- **A drafted plan holds its changes** until it's built, discarded or expires (15 minutes);
  discarded and expired plans give them back. A plan still makes at most 20 changes.
- **Refusals are free.** A plan Garrison's checks refused as unsafe gives its supplies back.
  Since supplies v2, a message the AI couldn't answer is charged what it used
  (`docs/AI_SUPPLIES_V2.md`).
- **Reading is free.** Garrison looking at settings to answer a question costs nothing beyond
  the message.
- Unused supplies carry from plan to plan through the month. Since supplies v2 they are a
  monthly pool (Free 200, Pro 3,000, Agency 13,000 shared) and a message is charged what it
  really cost; see `docs/AI_SUPPLIES_V2.md`.

**What's removed:** "plans a day", the change allowance, the request cap and the chat cap all
become supplies. Hidden safety limits stay: 10 AI calls an hour per server, and the global
daily AI budget (`QM_DAILY_BUDGET_USD`, $5) that pauses the assistant for everyone if reached.

**Where it shows:** the rail on the assistant page ("240 of 300 left · enough for about 10
full plans or 80 messages", the gauge cut into 20-supply segments), the send button ("3 supplies"),
every plan ("Uses 12 supplies"), the plan cards on the landing page and Plan page ("300
supplies a day: 15 full plans or 100 messages"), and the Refund Policy (Free allows 40 a day).

**Cost check** (`docs/pricing.md` gets the full table): a message costs Garrison about $0.0005
to $0.002 typically, $0.0036 at the token ceiling, and up to about 3x that when the assistant
reads settings first (each read is another round with the model; capped at 4 rounds). Pro at
100 messages a day, every day, at the ceiling: about $10.80 a month, so the global cap and
the hourly limit matter more than the per-server allowance. Real use is far lower.

## Tools: what the assistant can see and do

The assistant becomes a tool-using model (Claude tool use, in the bot, which holds the API
key). Two kinds of tools:

**Read tools, run straight away** (free, data only):

- `server_overview`: which modules are on, the plan (Free, Pro, Agency), supplies left.
- `module_settings(module)`: one module's current settings, as the dashboard shows them.
- The server snapshot it already gets: categories, channels, roles.

**Proposal tools, collected into a plan, never run by the model:**

- `build_structure`: categories, channels, roles, read-only rules and member permissions.
  This is today's plan format, unchanged.
- `change_settings(module, patch)`: one module's new values. Allowed modules and fields are
  exactly `EDITABLE_FIELDS` in `packages/db/src/repo/settings.ts`, the list the dashboard
  itself uses: watch, gatehouse (anti-raid, verification, backups), ops, ranks, ledger,
  escalation, rally, rewards, roles, messages, welcome, alerts, barracks, automod,
  suggestions, voice, starboard, tickets. Anti-nuke and its trusted list are not in that
  list and stay owner-only commands. Each patch is checked by the same function the
  dashboard uses (`checkAutomod`, `checkWelcome`, `checkTicketPanels`... all in
  `packages/db`), Pro-only fields are refused on Free, and role fields can never point at a
  role with dangerous permissions (`isDangerousRole`).
- `post(kind, id, channel)`: post a saved role menu, ticket panel or saved message, the same
  requests the dashboard sends today (`post_role_menu`, `post_ticket_panel`,
  `post_message`).

**Never:** moderation (warn, timeout, kick, ban, purge, lockdown), anything on members,
deleting or editing existing channels and roles, anti-nuke, billing and plans, the bot's
profile, server templates.

A proposal can refer to items the same plan creates ("turn on Suggestions in the new
#suggestions channel"): settings and posts use the plan's refs, resolved to real IDs as the
structure is built.

## How a plan with settings is built

Plans (`qm_builds`) gain two lists next to the structure: `settings` (module, patch, and the
diff the admin saw) and `posts`. Building runs in order: structure first, then settings with
refs swapped for the new IDs, then posts. Each settings patch goes through
`applySettingsChange`, so it lands in the server's settings history under the admin who
approved it, like a dashboard save.

**Undo vN** removes what the structure created (as now) and undoes each settings change
through the history, which already refuses to undo a field someone has changed since. Posts
are listed as "can't be undone" in the preview, the same rule as messages today.

**Database access:** *decided 2026-11-15: option 1, narrowed (migration 0058).* The bot role
gets column `UPDATE` only on the fields the AI builder may change, `INSERT` so a module's row
can be made on first use, and `SELECT, INSERT` on `settings_changes` (history stays
append-only). The dashboard role writes settings today; the bot role couldn't, for most
modules. The two ways considered:

1. **Recommended:** grant the bot role the same column-level `UPDATE` on the settings tables
   that the dashboard role has, and `INSERT` on `settings_changes`. One Build button, the
   same code path for chat and `/qm`, and the allowlist plus checks stay in one place.
2. Apply settings from the dashboard when the admin clicks Build, and only structure and
   posts in the bot. No new grants, but settings that point at channels the same plan
   creates need a second step after the bot finishes.

## Safety

- The model proposes; Garrison validates every field with the dashboard's own checks; a
  person approves the exact diff; every change is undoable or marked as not.
- Everything the model reads (setting values, welcome text, channel names, earlier
  conversation) is data, never instructions, as today.
- At most 4 tool rounds per message, 20 changes per plan, 6 settings modules per plan.
- Only someone with Manage Server can use it, re-checked when the plan is built.
- The owner-only boundary stays: anti-nuke, the trusted list and billing are out of reach.

## Phases

1. **Supplies.** *Done and deployed 2026-11-15.* Replace the change, request and chat
   allowances with one supplies balance (`AI_SUPPLIES_PER_DAY`, message 3, change 1),
   counted from `ai_usage` and `qm_builds`. Update the rail, send button, plan cards,
   landing, Plan page, Refund Policy, pricing doc and tests. Shippable alone. *Small.*
2. **Read tools.** *Done and deployed 2026-11-15.* The chat becomes a tool-using
   conversation that can look at settings to answer questions and suggest what's missing.
   No new powers yet. `server_overview` and `module_settings` in
   `apps/bot/src/modules/quartermaster/tools.ts`, read through `readSettings` (exactly the
   `EDITABLE_FIELDS`, so anti-nuke stays out of reach); channel and role ids come back as
   names; at most 4 rounds a message, the last forced to answer; a message still costs 3
   supplies. *Medium.*
3. **Settings plans.** *Done and deployed 2026-11-15 (migration 0058 applied).* A chat plan can
   change settings in eight modules (`QM_SETTINGS` in `packages/db/src/qm-settings.ts`):
   Suggestions, Starboard, Voice rooms, Automod (not AI moderation), Welcome (switches,
   channels and join roles, not card text), Leveling (on, where level-ups go), Logs, and
   Moderation's log channel and DMs. Each field is checked by the dashboard's own function
   for that module (`checkSuggestions`, `checkAutomod`...; simple checks in the file for
   Leveling, Logs and Moderation), channels and roles must be in the server or made by the
   same plan, and a role with moderation or admin powers is refused. Stored in
   `qm_builds.settings` (one entry per field, each costing a supply), checked again before
   building, applied after the structure with refs swapped for the new ids, through
   `applySettingsChange` under "<admin> (AI builder vN)", and undone newest first through
   the history, which leaves a field someone changed since. The preview lists each setting
   from → to. `/qm build` in Discord stays structure-only. The rest (anti-raid,
   verification, tickets, role menus, messages, alerts, raid templates, the warning ladder,
   rewards, game accounts) stays on its page. *Large.*
4. **Safe posts.** *Done and deployed 2026-11-15 (migration 0059 applied).* A chat plan can
   post the server's saved role menus, ticket panels and messages (at most 5, each one
   change) into a text channel, including one the same plan creates. The overview tool lists
   what can be posted with ids; `checkQmPosts` checks the item is saved and the channel is a
   text channel. Posts run last, through the dashboard's own post requests
   (`doPostRoleMenu`, `doPostTicketPanel`, `postMessageNow`) with the requesting admin as the
   member, so every existing check applies. Stored in `qm_builds.posts`; Undo leaves posts
   and says so. The preview lists what it posts and where. *Small.*
5. **Rename and polish.** *Done and deployed 2026-11-15.* Renamed "AI assistant" (owner's
   choice) everywhere people read it: menu, page, landing, Plan page, legal pages, bot
   messages; the URL and `/qm` stay. New starter prompts ("Set up moderation", "Welcome new
   members", "What's missing on my server?") and an "I can" list in the empty chat. *Small.*

Each phase ends with typecheck, tests (stub model) and a check on the local preview, and is
deployed only when the owner says so.

## Open questions

- **Rename:** *decided 2026-11-15: "AI assistant".*
- **Model:** Haiku 5.5 handles tool use well for this; if plans with many settings come back
  sloppy, route chat to Sonnet 5.5 at about 10x the cost per message, or raise the message
  price.
- **Discord:** a `/assistant` thread in Discord later, using the same tools, if owners ask.
