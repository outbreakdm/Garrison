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
3. **Community pages**: Welcome, Role menus, Tickets, Leveling. *Large.*
4. **The rest**: lists, Messages builder, Insights tabs, Settings access, templates gallery.
5. **Landing page.**

Each step ships on its own, checked on desktop and phone.
