# Redesign v2: Garrison at Peak Bot's level of polish

Written 2026-11-16 after a read-only walk through Peak Bot's landing page and all 23 of its
dashboard pages (the owner's account, nothing changed). Goal: Garrison's structure and finish
as close to Peak's as a separate product can be, while staying Garrison: our name, shield,
section colors, wording and features. We match how it works and how well it's made, never
Peak's brand, copy, images or exact pages.

## What makes Peak feel polished

1. **Nothing is folded away.** Every setting is on the page, open, in panels. You never press
   "Change" to see a form. Garrison folds most settings into rows that open.
2. **It saves itself.** An "Auto-saved" mark replaces Save buttons; switches act at once.
3. **One page shape.** A wide main column (editors beside live Discord previews) and a narrow
   right column (settings groups, or a live feed like "Recent actions").
4. **Choices are shown, not typed.** Presets as cards with a sentence each (Conservative /
   Recommended (default) / Aggressive), levels as cards (Relaxed, Moderate, Strict, Maximum),
   actions as one segmented row (Delete, Warn, Timeout, Kick, Ban).
5. **Lists look the same everywhere.** Filter pills (All, Active, Scheduled, Ended, Drafts), a
   count ("0/999 active"), a white "Create" button and a dashed create tile.
6. **Paid features are a sheet, not a lock.** Opening a Pro page shows the page dimmed under a
   short sheet: art, what Pro adds as a checklist, one white button.
7. **Quiet type.** Page titles are 16px beside an icon; there are no intro paragraphs; labels
   are small; the content starts at the top of the screen.
8. **Neutral greys.** #0a0a0a floor, #171717 panels, #262626 hairlines, 12px corners, a
   system font. Color only for state and small icons.

## System changes (do first; every page benefits)

| | Garrison now | Proposed |
|---|---|---|
| Greys | Blue-tinted (#0b0c0e, #131418, #26282f) | Neutral (#0a0a0a, #171717, #262626) |
| Corners | Panels 14, controls 9 | Panels 12, controls 8 |
| Page head | 22px title, gem tile, paragraph | 16px title with icon in the top bar; no paragraph (help moves into panels) |
| Settings | Folded rows, "Change", Save buttons | Open panels; fields save as you change them, with an "Auto-saved" mark and Undo in the toast (every change still lands in Settings history) |
| Pro | Inline lock tags, paused notes | A Pro sheet over the dimmed page; Pro fields keep a small tag |
| Choices | Selects and radios | Preset cards, level cards, segmented action rows |
| Lists | Tiles (Role menus, Messages) | One list template for every list page: filter pills, count, Create, dashed tile |
| Font | Archivo | Owner's call: keep Archivo (our voice) or Inter like Peak |

## Page by page

| Garrison page | Model in Peak | Changes |
|---|---|---|
| Overview | Overview | Done 2026-11-15 (header card, stats, charts, modules, cases). |
| AI assistant | AI Builder | Done: chat + plan panel + details + Features. Add: undo/redo and history in the chat head, copy/retry under replies. |
| Moderation | Auto Moderation | Automod as open panels: filter level cards, segmented "when found" row, word list editor, spam sensitivity, link filter switches; a right column "Recent actions" feed; cases below. |
| Security | Security | Anti-nuke presets as three cards with the default marked; every switch listed; anti-raid sensitivity cards and numbers in one panel; verification and backups as their own panels. |
| Logs | (none) | Same page shape: settings panel + live log feed in the right column. |
| Welcome | Welcome | Welcome, leave and DM editors open, each beside its preview; DM and roles on join in the right column; variable chips under each editor. |
| Role menus | Roles | Menus as a grid of mini-previews with a dashed "New menu"; editing opens a sheet (behavior segmented row, title, description, channel, roles with emoji) beside a live preview; join roles and rules as right-column cards. |
| Tickets | Tickets | Stat chips row, ticket panels as tiles, the queue with filter pills, settings rows below. |
| Leveling | XP & Leveling | Page switch in the head; announcement editor + preview; exclusions; right column of XP settings groups (message XP, voice XP, level curve cards); rank card. |
| Giveaways, Suggestions, Stream alerts, Starboard | Giveaways, Polls | List template; each item a row or tile with state; settings in the right column. |
| Messages | Messages + Embed library | A builder where you edit the message on the Discord preview itself, with send-as, channel and Send in a toolbar; saved messages as a library grid. |
| Groups and raids, Voice rooms, Game accounts | (Voice Channels) | Garrison's own; list template and page shape. |
| Insights | Analytics | Tabs (Engagement, People, Activity, Moderation, Safety, Growth), range pills, metric pills, stat cards with sparklines. |
| Settings | Server Settings | Add dashboard access: give people or roles Viewer or Editor access (new feature). |
| Plan | (Pro sheet) | The Pro sheet becomes the shared upgrade surface. |
| Server templates | Browse Templates | A gallery with categories, a featured template with its channel tree, cards with counts. |

## Landing page (garrisonbot.com)

Same order as Peak's, Garrison's words and art: a hero with a prompt box ("Build me a…") that
starts the AI assistant after sign-in, two buttons (Dashboard, See it in action); "replace N
bots with one" with three feature blocks (AI assistant, Insights, run it from Discord); a
scrolling wall of server templates; pricing; FAQ; help.

## Decisions (owner, 2026-11-16)

- Keep Archivo.
- Autosave with an Undo toast; every change still in Settings history.
- Build in the order below.

## Order

1. **System**: done 2026-11-16. Greys, corners, page head; then, after a second read-only look
   at Peak (Bot Profile's sheet, Security's presets, Auto Moderation's levels and actions,
   Giveaways' list), the rest, each built once and tried on one page:
   - *Autosave* (`components/AutoSave.tsx`, `lib/autosave.ts`): an open panel that saves as
     you change it, through the page's own action (same checks, same Settings history). The
     header bar reads Auto-saved / Saving… / Saved / Not saved; a toast (`Toaster.tsx`) offers
     Undo. Typing waits 0.8 s and skips values the field itself rejects until it's left.
     Before scripts load it's the old form with a Save button. On **Logs**.
   - *Pro sheet* (`ProSheet.tsx`): one per server on Free, opened by every foil tag and every
     "See what Pro adds" link, with that spot's sentence; the button goes straight to Stripe
     Checkout for Pro monthly. Garrison's shield in foil, not Peak's art.
   - *Choices* (`choices.tsx`): `Segmented` (Moderation: after removing a message),
     `LevelCards` (Moderation: AI strictness), `PresetCards` (Security: on a raid). Radios
     underneath; the picked card takes the page's section color.
   - *List head* (`ListHead.tsx`): filter pills with counts (`?show=`), "N of M running",
     the white Create, the new-item form as the dashed tile last. On **Giveaways**.
   Step 2 notes: settings actions return their outcome to a self-saving form
   (`settings/actions.ts`); `watch/actions.ts` (automod) still redirects and needs the same
   change before automod can save itself. `ListField` adds and removes rows without a change
   event, so it must dispatch one before it sits in a self-saving panel.
2. **Safety pages**: done 2026-11-16. The page shape (`.page-split`: main column of open
   panels, side column for tools and live lists; tables full width below).
   - *Moderation*: automod as five self-saving panels (Automod with its switch in the header,
     spam presets, mentions and what happens after; Links; Blocked words; AI moderation; Who
     automod skips), each sending only its fields (`_fields`, merged in `saveAutomod`). Side:
     Moderate a member, Caught by automod (a feed of automod's latest cases), Cases and
     appeals (self-saving). Cases table and ladder below.
   - *Security*: Anti-raid (switch in the header, "a raid is" presets, the response as preset
     cards) and Verification (with the Verify button under it) save themselves; anti-nuke
     stays owner-only with an explicit Save (it's a request the bot re-checks) but gains the
     same presets. Side: Lockdown, Quarantined, Backups (weekly switch saves itself).
   - *Logs*: settings beside Top inviters and the download; filters move into the events
     table's header.
   Not done here: the escalation ladder keeps its Edit form and Save (a half-built step
   would fail every check while you type), and spam/raid presets are Garrison's own numbers.
3. **Community pages**: done 2026-11-16.
   - *Welcome*: the welcome, leave and DM cards are open panels that save themselves, each
     beside its preview, full width (in a side column the DM's full card editor would be too
     narrow, so this departs from the plan); roles on join and the welcome image sit two up
     between them. Editors use `useSaveSignal` and `data-hold` (components/AutoSave).
   - *Role menus*: the list head (All, Posted, Not posted, "N of M menus", New menu) over the
     tile grid. The menu editor keeps Save and Post: it publishes to Discord.
   - *Tickets*: a stat row (open now, need a reply, unclaimed, and Pro's 30-day numbers), the
     queue with filter pills beside "Who handles tickets" (saves itself; tickets per member is
     a segmented row), then the panels as tiles with the dashed new tile.
   - *Leveling*: the leaderboard beside Leveling (its switch in the header, level-up messages
     as a segmented row), XP boosts (save themselves) and Seasons; the rank card saves itself
     below; level rewards keep Save (a row needs its level and its role together).
   Also: Settings history no longer records a "change" when a card is re-saved with empty
   fields its stored copy didn't have (a null key counts as missing, `repo/settings.ts`).
4. **The rest**: done 2026-11-16, except Settings access (below).
   - *List pages*: Suggestions, Starboard and Voice rooms put the list in the main column and
     their settings in a self-saving panel beside it (switch in its header); Stream alerts
     gets the list head over tiles; Groups and raids gives each board a list head with its own
     create; Game accounts lists the roster under a list head, stat roles open with Save.
   - *Messages*: the tile library under a list head (All, Scheduled, Sent, Drafts); an open
     message saves itself (the frameless `bare` panel) with a toolbar: Post now in a channel,
     Remove, the save mark. Post now rests while a save is pending (`data-pending`). Not done:
     editing the text right on the Discord preview (it reshapes the card editor six pages
     share, so it's a piece of its own).
   - *Insights*: Overview, Activity and Members tabs beside the range pills; stat tiles with
     the change against the range's first half and a 12-point sparkline. Peak's Moderation
     and Safety tabs need queries Garrison doesn't run yet.
   - *Server templates*: saved layouts as cards with their counts, "Save this server" as the
     dashed card. A gallery of ready-made templates with categories needs a catalogue of
     templates, which doesn't exist yet.
   - *Settings access*: done after the owner's go-ahead. Dashboard access on Settings: a
     person or a role as Viewer or Editor, with history and undo; enforced in lib/session for
     every page and action and again in the bot for its requests (SECURITY.md, Dashboard).
5. **Landing page**: done 2026-11-16.
   - *Hero*: the headline, then a "Build me a…" box (`components/BuildBox.tsx`, a GET form;
     Enter sends) with four idea chips, then Open the dashboard and See it in action (which
     scrolls to the lockdown demo, now just under the hero). The box goes to `/build`, which
     holds the text in a 30-minute cookie through sign-in (sign-in carries only a bare path),
     shows it on the server list ("Pick a server to build it in"), and hands it to the chosen
     server's AI assistant, written in and not sent (`?prompt=`). Viewers can't build, so
     only servers you run or edit offer "Build it here".
   - *One bot instead of five*: the AI assistant first, then Insights (the dashboard's own
     stat tiles and sparklines) and Run it from Discord (Discord's command picker, real
     commands and their descriptions), then Moderation and Groups; the module list after.
     The Overview and Anti-raid rows and the three steps are gone (the hero demo covers
     anti-raid; the box's hint says what happens next).
   - *Start from an idea*: eight starting points (`lib/build-prompt.ts`) scroll past as cards
     with a few of their channels, each a link into the same hand-off. It pauses under the
     pointer and for focus, and is a still, wrapped grid with reduced motion. These are
     prompts, not templates: a gallery of ready-made templates is still to come.
   - *Help*: /health, the status page, and the support address, after the FAQ.
   Not done: a typing placeholder in the box (Peak's), new art for the Insights and
   commands icons (slots added, no files yet, like the other landing icons).

Each step ships on its own, checked on desktop and phone.
6. **Menu and page clarity** (owner, 2026-11-16: "restructure the sidebar and ensure tools
   inside each page are clear, easy to toggle on and off, and know what is good to change").
   - *Menu*: Garrison's own line icons; Overview, AI assistant, Insights and Settings first;
     then Safety, Welcome, Engagement, Community and Gaming; Plan only in the rail's foot card
     (and the phone menu). Each module shows a green dot when it's on, an empty ring when off.
   - *Page head*: every module page says whether it runs, top right. Six have the module's
     own switch there (Automod, Anti-raid, Leveling, Starboard, Suggestions, Voice rooms),
     saving through its panel with Undo; nine show a status with the first thing to do
     (Logs, Welcome, Role menus, Tickets, Giveaways, Stream alerts, Messages, Groups and
     raids, Game accounts). Role menus count as on only once one is posted.
   - *Recommended*: choices mark Garrison's recommended option, with "Recommended setting"
     under it or "Recommended: X. Use it"; a few switches carry a Recommended tag while off.
   - *Recommended numbers*: `RecValue` under the fields with a clear default (mention limit
     5, timeout 10 min, unlock after 15 min, flag accounts under 7 days, logs kept 30 days,
     starboard at 3), with the same "Use it". Recommended is always Garrison's setting for a
     new server, never a new policy.
   Checked on desktop, phone (the phone menu wraps long names) and light theme. Not deployed.
7. **Critique fixes** (owner, 2026-11-16: "run /impeccable critique across all pages, then apply
   it"). The critique scored the dashboard 26/40 and the landing 23/32; all of it applied:
   - *True status*: modules are on, needs you (with the reason) or off, from one source, in the
     menu, the page heads and Needs attention. Live comes from the bot's heartbeat. Expired
     plans and raids that already started no longer wait; stuck requests do. A one-time
     message that never went out says Missed.
   - *Phones*: Lockdown and Moderate a member come first on Security and Moderation; the
     Overview can lock the server; search finds both.
   - *Pro on Free*: one folded "Your own look" group per card editor (Welcome went from 23
     tags to 8); the plan card's button is grey.
   - *Consistency*: Settings history in plain words; the time zone saves itself; Settings
     lists only the three settings inside other pages; Recommended is advice (muted, a star),
     not the green of "on"; Use it is a button; Draw now, Cancel and Remove confirm, with
     Never mind; the Welcome group is Onboarding, so its chip doesn't repeat the title.
   - *Layout*: Overview's 15-row module list became "Worth turning on"; Seasons sit under the
     leaderboard; Starboard, Suggestions and Voice rooms put settings first while their list
     is empty; Groups and raids has one way to create each thing.
   - *Details*: charts in the page's own color at a tint; plain Overview wording; a short
     appeal link; the theme button with an icon; search keeps its words.
   - *Landing*: Add to Discord leads the hero; no coloured glows or spotlights; a reading
     measure; readable slash-command text; a button on every plan.
   Not changed: Insights' active members on the Overview reads a table the local test data
   leaves empty (the bot fills it in production); "By: Marshal" is a legacy name in the test
   data's cases.
