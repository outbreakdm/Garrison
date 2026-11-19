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

## Editing and deleting (built 2026-11-19)

Owner decision (2026-11-19): the assistant may change and delete what already exists, keeping
Claude Haiku 5.5. Real chats showed the add-only builder failing at what managers ask most:
"set up permissions for each channel" (it couldn't touch existing channels), claiming work it
then couldn't do (the hidden 6-order cap), and saying wrong things ("bots can't assign roles").

- **Edits** (`edits` on `qm_builds`, migration 0074; `QmEdit` in `packages/db/src/schema.ts`):
  rename; topic, slowmode, user limit, age restriction; move a channel between categories or
  sync it with its category; set who sees and who posts or speaks in a channel or category;
  a role's name, color, show-separately, mentionable and member permissions (from the same
  allowlist as new roles; other bits it holds stay). Checked in `quartermaster/edits.ts`, applied
  after the plan's new items and before orders, settings and posts.
- **Access edits** change only view, send, threads, read history, connect, speak and stream,
  and only bits Garrison holds. "Private to X" clears other plain roles' explicit view allows;
  staff and bot roles keep theirs. Editing a category's access keeps channels that followed it
  in step.
- **Undo** puts every edited item back from the state recorded just before it changed
  (`QmCreated` "edit": name, topic, slowmode, limit, category and every overwrite, or a role's
  name, color, flags and permissions), including channels that followed an edited category.
- **Deletes** (`delete_channel`, `delete_category`, `delete_role`) are permanent: at most 10 a
  plan, run last, shown as "can't be undone" in the Discord card and on the dashboard, and
  recorded as "deleted" so Undo says what it couldn't bring back. Refused: Discord's rules,
  community-updates and safety-alerts channels, channels any Garrison setting points at, roles
  with staff powers, bots' roles, roles above Garrison, @everyone. Checked again when applied.
- **What it sees**: every channel's kind (text, voice, forum, announcement, stage, media),
  topic, slowmode, limit and access in words (hidden from everyone, visible to, read-only, who
  can post, own permissions); every category's access; each role's permissions, color, flags,
  member count (when Discord gave every member) and whether it's editable; the server's size,
  Community status, verification level and what Garrison may do.
- **Prompt**: every limit stated up front (changes in <limits>, 6 orders, 10 deletions, 5
  roles per access list), Discord's permission model and channel kinds, the correct facts on
  role assignment, and "describe what the plan will do, never say it's done".
- **Self-repair**: when Garrison's checks refuse a chat draft, the model gets the exact reasons
  and its own draft once and returns a corrected plan (only when the message's hold pays for the
  call). The admin sees the checker's reasons only if that also fails.
- Still not possible: creating forum, announcement or stage channels; giving a role to a
  specific member; anything with admin or moderation powers; moderation itself.


## Assistant v2: model choice, a cost ceiling that holds, wider coverage (planned 2026-11-19)

Owner's goals: a much better assistant, a choice of model for admins, supplies that adjust
to the model so Garrison can never lose money on AI, and an assistant that can handle the
whole range of what a Discord community asks. Analysis behind it:
`docs/haiku-sonnet-split.html` (production usage, 10 calls, 15–18 Nov).

**Owner decisions (2026-11-19):**
- Models: **Haiku 5.5 ("Fast", the default) and Sonnet 5.5 ("Smart")**. No Opus.
- Sonnet is **Pro and Agency only**; Free stays on Haiku. Supply packs cover either model.
- Supplies stay worth $0.001 of AI at the model's real price, so a Sonnet message costs
  about 15–20x a Haiku one in supplies and the pool's dollar ceiling holds on any model.
- Close every coverage gap: writing content, setting up more modules, server insight and
  Garrison how-to help.

**The hole found (fix first):** a message's hold assumes at most 12,000 input tokens a
round (`QM_MAX_INPUT_TOKENS`), but nothing enforces it. The snapshot (150 channels, every
role with its details), 16 turns of history and up to 6,000 characters per tool result
are sent as they are, and a round 2 or 3 re-sends everything before it. One small test
server already wrote 11,280 tokens to the cache in one message. A big server can cost more
than its hold, and `finishAiCall` charges the real cost, so a pool can go past its ceiling.
On Sonnet that's 20x the money.

### Phases

1. **A ceiling that holds.** *Done 2026-11-19, not deployed (no migration).* Built as below,
   plus: a request that may have been billed without an answer (timeout, cut off) is charged
   its worst case; the SDK no longer retries on its own (a retry after a timeout could be
   billed twice), and the planner retries only 429, 529 and 5xx; the self-fix after a refused
   draft gets only what the first answer left of the hold; `QM_MODEL` must be in
   `MODEL_PRICES` or the bot won't start; Sonnet 5.5's fallback is Sonnet 5 by name, and its
   requests hold twice their worst case; a call that still costs more than it held is logged
   as an error. Tests in `planner.test.ts` ("a message never costs more than it holds").
   The plan as written: Count each round's input before sending it (`count_tokens`,
   free) and price it on the model it will run on. Size the hold from the real input plus
   the output cap, not from a guess. Before each further round, check that what's left of
   the hold covers that round's worst case. If it doesn't, answer now (`tool_choice: none`)
   with `max_tokens` cut to fit. Trim to fit, oldest first: history turns, then tool
   results, then snapshot detail. A model that isn't in `MODEL_PRICES` is refused instead of
   priced as Opus. Price Sonnet's cache reads at its real 0.05x. Tests: a message can never
   be charged more than it held, on either model or any server size. *Medium.*
2. **The Your server workspace.** *Done 2026-11-19, not deployed: needs migration **0076**
   (`qm_edit` request kind).* Built as below, with these differences: the requests list moved
   to the History tab instead of going away (the panel shows a draft's own requests: Saving…,
   and how the last apply, discard or removal went); "Use as template" isn't on history rows,
   since a template copies a whole server, not one build; conflicts show as a list in the
   panel with Keep and Drop, not on each row. Also fixed: "Remove from plan" used to drop all
   of a draft's edits. How it works: `apps/bot/src/modules/quartermaster/hand.ts` (each change
   checked against the server; `keepHandChanges` for redrafts), `doQmEdit` in
   `dashboard/more.ts` (onto the person's newest waiting draft when it runs, so quick edits
   chain), `handEdit` in the page's `actions.ts`, `components/WorkspaceEdit.tsx` (rename in
   place, drag, Move up / down, shown at once and confirmed by the bot), and hand edits'
   own queue allowance (30 a minute, 20 waiting). Hand changes are marked `by: "admin"` and
   left out of the supplies count in SQL. Not checked in a browser yet: the local stack needs
   Docker. Known gap: an AI redraft that lands while a hand edit is replacing the same draft
   leaves two drafts waiting; the page shows the conversation's.
   The plan as written: the right panel is always "Your server": the live server,
   with every pending change marked in place (new, changed, moved, deleted), whether the
   assistant drafted it or the admin made it by hand. Owner's request (2026-11-19).
   - **Apply build**, top right of the panel's head, appears once anything is pending and
     says how much ("Apply 7 changes"). Discard sits beside it. While a build runs, the
     button becomes its progress ("Building 4 of 7"), then "Undo" for a minute after.
   - **Hand edits, no AI:** rename a channel, category or role in place (click the name or
     press Enter on it), and drag to reorder channels in a category, move a channel to
     another category, reorder categories, and reorder roles below Garrison's own. Each
     row also has Move up and Move down for keyboard and touch. Locked rows (staff and bot
     roles, roles above Garrison, Discord's own channels) can't be dragged and say why.
   - Hand edits go into the same pending draft as the assistant's, as `edits` and `order`
     entries, so they share the checks, the preview, Apply and Undo. They're marked as the
     admin's and kept when the assistant redrafts; the assistant sees them in
     <previous_plan> and is told never to drop them. They cost no supplies (no AI ran),
     with a cap of 50 a build for Discord's rate limits.
   - Before Apply, Garrison checks the draft against the server as it is now. If someone
     changed a drafted item in Discord meanwhile, that row shows the conflict, and Apply
     waits until it's kept or dropped.
   - **Moved off the page's bottom:** Build history becomes a third page tab (Chat, History,
     Server templates), each row with Undo and "Use as template". The requests list goes
     away: a running build shows in the Apply button and in the panel's rows, and a failed
     request shows as a notice in the panel with Retry.
   - The panel's footer rules text is updated, since a plan can now rename, edit and delete.
   *Large.*
3. **Model picker and chat.** *Done 2026-11-19, not deployed: needs migration **0077**
   (`qm_messages.model`).* Built as below, with these differences: Smart runs **without** the
   refusal fallback, because a fallback can bill a request twice and every Smart message would
   have to hold twice its worst case (turn it on in `planner.ts` `FALLBACK`; holds double by
   themselves); Haiku stays at effort `medium` until the eval (phase 4) shows `low` holds up.
   Fast is about 3 supplies a message (holds up to 14), Smart about 45 (holds up to 270), from
   `qmTypicalSupplies` and production usage. The Smart model is `QM_SMART_MODEL` (default
   `claude-sonnet-5-5`, must be in `MODEL_PRICES`). Progress is written to the chat request's
   message while it runs (`noteDashboardAction`): "Reading your server", "Looking at your
   Moderation settings", "Checking the draft", "Fixing what Garrison's checks refused".
   Past conversations: the 8 newest, reopened with `?thread=`. The Smart confirmation is asked
   once per browser. Not checked in a browser yet.
   The plan as written: a Fast / Smart switch in the composer. Smart is Pro and
   Agency only (Free sees it locked, with Upgrade). The model is stored on the message and on
   `ai_usage`. A thread can switch models, which loses the prompt cache for one message.
   Before Sonnet ships, check on a real refusal how a fallback is billed (whether the
   declined attempt shows in `usage`), and keep the 2x hold until it's known.
   Sonnet runs at effort `medium` with the server-side fallback; Haiku runs questions at `low`
   once the eval shows answers hold up. `QM_MODEL` stays as the operator's default. With it,
   owner's picks of 2026-11-19:
   - **Price before sending:** the composer shows what the message will hold and its likely
     cost on the chosen model, and "about N messages left" for that model. Smart asks once
     before a message that could use more than 100 supplies.
   - **Progress while it thinks:** each step shows as it happens ("Looking at your
     settings", "Drafting 12 changes", "Checking it"), written by the bot to the chat
     request as it goes and read by the page's existing refresh.
   - **Past conversations:** a list of earlier threads (first message, when, how many
     drafts) to reopen, beside New conversation.
   *Medium.*
4. **An eval set.** *Built 2026-11-19, not deployed: needs migration **0078** (reply ratings);
   never run against the real models yet (needs `ANTHROPIC_API_KEY`).* In
   `apps/bot/src/eval/`: `fixture.ts` (Ironclad, a hand-written mid-size gaming server with a
   staff channel everyone can see, an unused channel, and injection traps in a channel name,
   a role name and the welcome text), `cases.ts` (43 cases in 9 categories: design, edit,
   question, settings, posts, how-to, writing, refusal, injection; each with whether it
   should draft, a check for what it asks, and a reference answer), `grade.ts` (code only, no
   model judge: drafted right, valid by `validatePlan` and the settings fields, on task, safe:
   no deletion it wasn't asked for), `harness.ts` (calls the real `ClaudePlanner.chat` with the
   production hold; errors, timeouts and a wrong serving model are kept out of the scores;
   pass rates with 95% intervals, cost from the API's tokens, p50/p90 seconds). CI runs the
   self-tests: every reference passes, empty and "Sure." answers fail, a plan that deletes
   the server fails every case. Real runs: `pnpm --filter @garrison/bot eval` prints the cost
   (about $0.39 Fast and $5.80 Smart for 3 runs; at most $1.81 and $34.83) and runs only with
   `--yes`; `--models fast --reps 1` is the cheap check. Results go to
   `apps/bot/eval-results/` (not committed). Ratings: thumbs up or down under each reply, a
   note with a thumbs down (`qm_messages.feedback`, written by the dashboard through a grant
   on those three columns only); `pnpm --filter @garrison/bot eval:collect` writes the
   thumbs-down replies with the message they answered to a candidates file for review.
   The plan as written: before adding powers: about 40 real-style requests across design, edits
   and permissions, server questions, settings, posts, how-to, writing, insight, refusals
   (moderation, admin powers, anti-nuke, billing) and injection in names. Score each on a
   valid draft first try, doing what was asked, refusing what it must, tokens and seconds.
   It runs on the stub in CI, and on both real models on request (about $3 a run, needs
   `ANTHROPIC_API_KEY`). Every later phase must keep or raise its scores. With it (owner's
   pick): **thumbs up or down on every reply**, with an optional note, stored with the
   message; a thumbs-down reply can be added to the eval set, so what real admins ask keeps
   testing the assistant. *Medium.*
5. **Garrison how-to help.** *Done 2026-11-19, not deployed (no migration).* One help file,
   `packages/db/src/help.ts`: 29 entries (what it does, its page and path, steps, commands,
   keywords), with Free and Pro limits read from `FEATURES` so they can't drift. The chat's
   `garrison_help` tool returns an entry, and the instructions say to look it up for any
   how-to, page, command or plan question and never guess one; how-to replies may be a
   sentence and up to six "- " lines (the chat keeps line breaks). The dashboard's new Help
   page (in the menu's foot, beside Settings) shows the same entries, and search finds them.
   Two eval cases added (Pro ticket panels, the LFG command): 45 now. Tests check every
   entry's page exists and every plan line resolves. The eval hasn't run on the real models.
   The plan as written: a `garrison_help` read tool that returns the real help text for
   a feature (what it does, where it lives, which plan has it, how to set it up), from one
   help file the dashboard can show too. Replies may run longer and use short lists when the
   admin asks how something works or asks for written content. *Small.*
6. **Server insight.** *Done 2026-11-19, not deployed (no migration).* One read tool,
   `server_insight`, with fixed topics: activity for a week, a month or a year (a year is Pro;
   Free is held to 30 days, as on Insights), moderation (cases in 7 and 30 days by action and
   by who made them, and how many were undone: counts only, never who a case was against),
   tickets (the queue; opened, closed and time to first reply on Pro, as on Tickets), the
   latest health check's problems, the leveling top 10, and what's coming up (raids with
   sign-ups and bench, running giveaways with entries, open groups). Built on the dashboard's
   own queries (`packages/db/src/repo/server-insight.ts`); channel ids come back as names. The
   instructions say to answer with numbers and their period, never guess one, suggest a next
   step, and never name who a case was against. 8 eval cases (53 in all); a test reads real
   rows and checks no case target leaks. The eval hasn't run on the real models.
   The plan as written: read tools for what the dashboard already shows: member counts and
   joins and leaves over time, activity and top channels, mod cases and warnings by week,
   open tickets, server health checks, leveling top members, giveaways and raids coming up.
   Totals and lists the dashboard shows only; nothing new about any one member. *Medium.*
7. **Writing content.** A plan can create and edit saved messages and embeds (Messages),
   welcome and leave card text, and a rules or info channel's message, written by the model
   and shown in full before it's applied. Everything goes through the dashboard's own checks.
   Posting still needs the admin's yes. *Medium.*
8. **More modules.** Extend `QM_SETTINGS` and the proposal tools to tickets (panels, staff
   roles), role menus (create, not just post), anti-raid and verification (never anti-nuke),
   stream alerts, giveaways, economy, raid and LFG templates, the warning ladder, level
   rewards and invite roles. Create forum and announcement channels. Each module uses its
   page's own check function. *Large; split by module.*

Each phase ends with typecheck, tests, the eval (from phase 4) and a check on the local
preview, and is committed before the next starts. Deploys only when the owner says so.


### Also proposed, not scheduled (2026-11-19)

The owner scheduled progress, price before sending, past conversations (phase 3) and thumbs
(phase 4). Still open:

- **Per-item revert** in the workspace: drop one pending change without asking the assistant.
- **Who may apply.** A setting for whether dashboard members without Manage Server can apply a
  build or only draft one.
