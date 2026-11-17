---
name: Garrison
description: "Guard the gate. Rally the squad. The dashboard as the server's control room: flat panels on a near-black floor, each led by a header bar that carries its state."
colors:
  floor: "#0a0a0a"
  panel: "#171717"
  panel-raised: "#1f1f1f"
  hairline: "#262626"
  hairline-strong: "#333333"
  ink: "#ededed"
  ink-muted: "#a1a1a1"
  primary: "#fafafa"
  primary-ink: "#0a0a0a"
  go: "#2bd99f"
  caution: "#ffb547"
  alert: "#ff6b6b"
  intel: "#5ab0ff"
  cobalt: "#7b93ff"
  orchid: "#df95f5"
  volt: "#d4ff3a"
  steel: "#a9bdd6"
  light-floor: "#f3f3f5"
  light-panel: "#ffffff"
  light-hairline: "#e2e3e8"
  light-ink: "#121317"
  light-ink-muted: "#5b5e69"
typography:
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "26px"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: "22px"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  ui:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: "20px"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
rounded:
  chip: "6px"
  control: "8px"
  panel: "12px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "36px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "16px"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "38px"
  nav-item-current:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    height: "34px"
  chip:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
---

# Design System: Garrison

## Overview

**Creative North Star: "The Control Room"**

Garrison's dashboard is where an owner runs their Discord server, so it looks like a well-run control room: a near-black floor, flat panels a step lighter with hairline edges, and white where you act. Each panel opens with a header bar that names it, counts it and carries its switch or action, so state reads at a glance before any prose. Editors sit beside a live Discord preview, so what you write is what members will see. The look is our own, heavily inspired by Peak Bot (2026-11-15, replacing Card Table); Garrison keeps its name, shield, Archivo and its four section colors.

Density is high but calm: 13 to 14px UI text, 52px header bars, 16px panel padding, 16px gaps. Color does jobs, never decoration: the four section colors tint icon tiles and gems so you always know which part of the server you're in; go, caution and alert mark state; white marks the one thing to do.

**Key Characteristics:**
- Flat panels on a near-black floor, edges drawn by 1px hairlines, no drop shadows at rest.
- The header bar: a tinted tile with the section gem, the title, a count pill, then the switch or action on the right, over a hairline.
- White primary buttons and switches (black in light theme); everything else is grey-on-grey.
- A full-height server rail: logo, server card, grouped menu with the current page as a white pill, the plan at the foot.
- Editors beside a live Discord preview that stays in view while you scroll.

## Colors

A neutral near-black ladder with one white action color and four section hues that only ever tint.

### Primary
- **Signal White** (#fafafa): primary buttons, switches when on, the current menu pill, the selected tab. The one thing to press on a panel. In light theme it inverts to **Ink** (#121317) with white text.

### Section identities (tints, never fills of large areas)
- **Safety Cobalt** (#7b93ff): Moderation, Security, Logs.
- **Community Orchid** (#df95f5): Welcome, Role menus, Tickets, Leveling, Giveaways, Starboard, Suggestions, Stream alerts, Messages.
- **Gaming Volt** (#d4ff3a): Overview, Groups and raids, Voice rooms, Game accounts; also the plan's Pro line.
- **Server Steel** (#a9bdd6): Insights, AI assistant, Settings, Plan.

The current page's color reaches its icon tiles, gems, the server card's initial, focus rings and text selection (`.shell` sets `--id`, `--id-text`).

### Status
- **Go** (#2bd99f): on, armed, posted, scheduled, "+N new".
- **Caution** (#ffb547): waiting, paused, "~N settings".
- **Alert** (#ff6b6b): needs you, destructive.
- **Intel** (#5ab0ff): informational chips.

### Neutral
- **Floor** (#0a0a0a): page background.
- **Panel** (#171717): every panel face.
- **Panel Raised** (#1f1f1f): inputs, hover rows, count pills, user message bubbles.
- **Hairline** (#262626) and **Hairline Strong** (#333333): panel edges and dividers; the strong one for hover, open panels and dashed "new" tiles.
- **Ink** (#ededed) and **Ink Muted** (#a1a1a1): text and secondary text.

### Named Rules
**The One White Rule.** Each panel has at most one white control: its primary action or its on switch. Secondary actions are grey.
**The Tint-Only Rule.** Section colors tint tiles, gems and focus; they never fill a button, a panel or a page area.

## Typography

**All text:** Archivo (variable width), with system-ui fallback. Tabular figures on every count and number.

**Character:** one grotesque, set small and tight, so panels hold a lot without shouting.

### Hierarchy
- **Headline** (700, 18px/26px): the page title, beside its gem tile.
- **Title** (650, 15px/22px): panel titles in header bars.
- **Body** (400, 14px/20px): descriptions and settings sentences; 68ch measure for page intros.
- **UI** (600, 13.5px/20px): buttons, menu items, tabs.
- **Label** (600, 12px/16px): field labels, rail group names (11.5px there), help text at 13px.

## Layout

The rules from docs/LAYOUT_PROPOSAL.md, as built. One meaning per column, one template per view.

- **Four widths, nothing else:** 520 (small phones), 720 (the rail becomes the phone sheet), 1100 (side columns, previews and the 12-column Overview come in; rules below it use 1099) and 1280 ("On this page" beside Setup). Height queries and hover or motion queries are separate.
- **Shell:** a 256px rail beside the page from 721px up. The logo, server card and plan card stay put; only the menu list between them scrolls, with Settings pinned at its foot. The top bar holds search, theme and account. The page is centered at up to 1280px.
- **Phones (720px and under):** one bar row (server switcher, a search icon that opens the field across the top, theme, account), then the pinned page bar, which names the page and opens every page as a sheet. The page's own title is kept for screen readers only, so the head starts with its state, then its tabs. The first panel sits about 180px down.
- **The head:** title, section tag and state on one line; the intro is one sentence of about 90 characters at most, with anything more under "How this works". A problem is said once, as the Needs-you strip across the foot of the head.
- **Page tabs** split a module with several jobs (Moderation: Cases, Automod, Escalation and appeals). Each tab is its own address (`?tab=`), switches in place, and a `#section` link opens the tab it's on. Every tab stays on the page, hidden, so the head switch and the settings form always work.
- **Templates.** Each tab or small page uses one:
  - *Activity* (cases, the queue, the board, events): the live list in the wide column, quick tools and small facts in a 300 to 360px side column from 1100px; below that the list comes first. A wide table (Logs' events) takes the full width, its small facts under it.
  - *Setup* (configuration): one column of panels; from 1280px an "On this page" index beside it jumps to each panel and shows its save state.
  - *Library* (role menus, messages, stream alerts, ticket panels): a grid of tiles, at least 260px wide, with a dashed "new" tile last. A tile opens its editor on a page of its own (`?edit=<id>`), full width with its preview and a link back to the tile.
  - *Compact* (Starboard, Suggestions, Voice rooms, Invites): settings at 60% beside the live list at 40% from 1100px; on phones the list comes first when it has items.
- **The Overview** is four bands on 12 columns: attention (or "All clear", with the health check), the pulse (four numbers), activity (the messages chart with top channels, 8, beside recent cases, 4), modules (tiles of 3 or 4). A band's tiles share one height.
- **Fields have a width for what they hold:** numbers up to 160px, pickers up to 360px, text up to 640px. Repeating rows show what's set plus one spare, with an Add button for the next.
- **A rule reads as a sentence** with its numbers in place: "Remove messages when someone sends more than [6] messages within [8] seconds", "It's a raid when [10] or more people join within [30] seconds".
- **Help text stays at two lines;** anything more sits under "How this works". A warning the reader needs (what's sent to OpenAI, that claimed accounts count) stays in the visible part.
- **"Needs you" carries its fix:** a setting jumps to its panel; a missing permission is a button to Discord's page for giving it ("Give Move Members").
- **Panels stack with 16 to 24px gaps.** Editors put fields and a 320 to 460px preview side by side from 1100px; below that the preview comes first.
- **AI assistant:** chat beside a 340 to 400px plan panel from 1100px; the chat fills the screen height and scrolls inside.

## Elevation & Depth

Flat by default. Panels use hairlines and one step of tone, not shadows (`--shadow-card: none`). Shadows appear only on things that float over the page: menus, the phone page sheet, dialogs (`--shadow-lift: 0 18px 40px -16px rgb(0 0 0 / 0.75)` plus a 1px inset highlight).

**The Flat-At-Rest Rule.** Nothing on the page casts a shadow unless it floats above it.

## Shapes

Panels 12px, controls 8px, chips and badges 6px, pills and switches fully round. Gems are 8 to 10px squares rotated 45° with 2px corners, set in 28 to 36px tinted tiles. "New" tiles are dashed with the strong hairline.

## Components

### Header bar (signature)
The first line of a panel: 52px tall, full width over a 1px hairline, 10px by 16px padding. Leads with the section gem in a tinted tile, then the title (15px, 650), a count pill (Panel Raised, 12px), and the switch, link or button on the right. Applied automatically to any panel whose first child is its title or title row; table panels and collapsible settings rows use the same tile.

### Settings panel that saves itself (redesign v2)
Settings are open on the page, never folded behind "Change". `AutoSaveCard` is a panel whose header bar ends in the save mark: a ring and "Auto-saved", a spinning ring and "Saving…", a go dot and "Saved", an alert dot and "Not saved". Switches, picks and selects save at once; typing waits 0.8 s. Each save goes through the page's own action and lands in Settings history; a toast says what was saved and offers Undo. Before scripts load it shows a Save button instead. The older folded row (`details.panel`, facts and "Change") remains on pages not yet moved over.

A panel's own on/off (AI moderation, Backups) is a switch at the far right of its header bar, after the save mark. A module's main on/off is in the page head instead (below). When one action's settings are split over several panels (automod's five), each panel sends only its own fields.

### Module state (page head and menu)
Every module page says at its top right whether it runs, always in the same place. Six have the module's own switch there (Automod, Anti-raid, Leveling, Starboard, Suggestions, Voice rooms): a pill with the name, "On" in go or "Off", and the switch, which joins its panel's form and saves with Undo. The others show a status pill: a dot, On or Off, what's set up, and the first thing to do as a link ("Pick one"). A module that's switched on but can't work (no channel, a deleted channel, a missing permission) adds a caution pill: a triangle, "Needs you", the reason, and where to fix it. The menu shows the same three states after each module: a go dot (on), a caution triangle (needs you), an empty ring (off), with the word for screen readers. The Overview's Needs attention lists every module that needs you. One source decides all of it (`lib/module-states.ts`), so a green never lies.

### Recommended
Garrison's own setting for a new server is marked as advice, never as state: a "Recommended" tag in muted text on the card, a small star on the segment, and a line under the choice or number: a muted check and "Recommended setting", or "Recommended: Balanced. Use it", where Use it is a button that puts it back and saves. Switches Garrison recommends on carry the tag only while off.

Card editors (welcome, leave, DM, rank card) save themselves too: their fields are React state, so the editor tells its panel about each change (`useSaveSignal`), and a save that can't go through yet (no channel picked, a Pro field on Free) is held, with the reason under the fields and "Not saved yet" in the caution color in the header. Undo resets the editor; ordinary saves never re-create it, so focus stays where you're typing. Builders that publish to Discord (role menus, ticket panels, messages) and multi-row editors whose rows are only valid once complete (the escalation ladder, level rewards) keep an explicit Save.

### Sensitivity presets
Where a setting is a pair of numbers (spam, what counts as a raid, when anti-nuke steps in), level cards stand for them, with Custom last: Relaxed, Balanced (marked as the default in its line), Strict. Picking a card fills the numbers, which stay on the page underneath; typing your own lights the card they match, or Custom. Four cards go two by two on a phone.

### Stat tile
A label in muted 13px, the number at 26px semibold in tabular figures, then a line: the change against the range's first half (▲ in go, ▼ in caution, as a whole percent) and a sentence of context. Where the range has a series, a 12-point sparkline under it: a 2px muted line, the latest point in the page's section color. The tile's words carry the meaning; the sparkline is only the shape.

### Page tabs
For a page with several jobs (Moderation, Security, Settings, Welcome, Leveling, Tickets, Groups and raids, Economy, Logs, Game accounts) or views of one subject (Insights): text tabs on the head's bottom hairline, the current one underlined in the section color. A tab can carry a count ("Queue 1") or a caution mark when something on it needs you. Each tab is a link with its own address; switching keeps the page and its forms in place.

### Shared access
Someone a manager gave access sees one line above the page: a Viewer or Editor badge and what they can do. What they can't do stays on the page, disabled and dimmed, with the reason on hover; searches and filters keep working. On Settings, Dashboard access lists each person or role with a Viewer / Editor switch and Remove, then adding a role or finding a person. The server list has "Shared with you", each tile saying what you can do there.

### Feed
A list in the side column: one line per item, newest first, a hairline between, the time or count on the right in muted tabular figures. Empty, it says in a sentence what will show up.

### Toast
One at a time, centered at the foot of the screen: a small gem (go or alert), one sentence, a white Undo when there's something to take back, and a close. 6 s (9 s for errors), held open while hovered or focused.

### Pro sheet
Every foil "Requires Pro" tag and every "See what Pro adds" link opens the same sheet over the page, dimmed to 78% and blurred 3px: Garrison's shield drawn in foil over a faint grid, "Part of Garrison Pro", the sentence from the spot that opened it, one white button straight to Checkout, then what else Pro adds as a checklist and a line of fine print. 20px corners, the only floating thing with a lift shadow besides menus.

### Choices
A pick among a few is shown, never typed or selected. **Segmented row**: a recessed track, options sharing its width, the picked one raised with a strong edge (not white: the One White Rule holds). **Level cards**: a scale, weakest first, always one row; signal bars fill one step per card. **Preset cards**: a name (with a "Recommended" tag on Garrison's own setting), what it does in a few words, who it's for in a sentence. Picked cards take the page's section color on their edge and a filled ring top right. All are radios underneath.

### List head
Every list page opens with it: filter pills in a track (each with its count, the current one raised), then on the right the count against the plan ("1 of 2 running") and the white Create. The form for a new item is the dashed tile at the end of the list. On phones the pills share the full width.

### Buttons
- **Shape:** 8px corners, 36px tall, 13.5px semibold, never wrapping.
- **Primary:** Signal White with black text. Hover darkens toward the floor.
- **Secondary:** Panel Raised with a hairline; hover strengthens the edge.
- **Ghost:** muted text, raised background on hover. **Danger:** alert text and edge.

### Switches
38 by 22px. Off: Panel Raised slot, muted knob. On: white track, black knob, 180ms ease-out.

### Inputs
Panel Raised, hairline edge (strong on hover), 8px corners, 38px tall; focus ring 2px in the section color.

### Navigation (rail)
Groups follow what an owner sets out to do: Overview, AI assistant and Insights first, then Safety, Members, Engagement, Posts, Support and Gaming, with Settings pinned at the foot (Plan is the plan card below it, and in the phone sheet). A group folds behind its name, remembered per browser; a folded group still shows a Needs-you mark, and arriving on a page opens its group. Group names at 11.5px led by their gem; items 32px with Garrison's own 16px line icon, muted, raised on hover, and the module's state at the end. The group name is also the tag beside each page's title. The current page is the white pill, on the phone menu too. The server card on top shows the server's initial in a tinted tile, its name and "Switch server". The plan card at the foot names the plan with one line and a grey button (the rail keeps one white thing), and marks itself on the Plan page.

### Color as place
The four section colors say where something lives. The menu's icons carry their section's tint (Safety reads blue before you read a word); a panel or tile that belongs to another part of the server than the page it's on takes that part's color on its tile, gem and icon through `data-tint` (the Overview's Security panel and moderation stat in cobalt, raids in volt, charts in steel). Links, focus and selection keep the page's color. Charts and meters draw at a tint (about 40 to 55% of the section color over the panel), never a full fill. The landing's product shots wear the color of the page they show.

### Motion
One authored moment: the state ripple. Flip a module and the change travels: the head pill eases to its new color, the menu's light flares once in the new state's color (pop and ring, `data-changed`, first paint never flares), the toast says what happened. Feedback around it is small and fast: the save mark's dot lands, a Needs you note arrives, folds open by height. Reduced motion keeps every color and state change and drops the movement.

### Member space
`/play/[guildId]`, for anyone in the server: no rail, a header with the server's initial tile and name ("Your space in this server"), text tabs for its pages (You, Groups and raids, Your record when on), then the page in the same panels. You puts the member's rank card, drawn as /rank draws it, beside the details it asks for and changes as they type; the leaderboard marks their own row. Your record lists their cases with the action badge, reason and length, undone ones marked, and the appeal link. The server list's "Servers you're in" opens it.

### Pro on Free
In a card editor, every look option (author line, title link, accent, images, footer) folds into one "Your own look" group with a single Requires Pro tag; a card that already uses one opens it. On Pro the fields are open as usual. One tag per place, never one per field.

### Confirm before what can't be undone
Draw now, Cancel a giveaway, Remove a message, Cancel a raid and Lock the server each open an inline "Yes, …" step under their toggle, which then reads "Never mind".

### Tabs
A segmented row of 13px semibold labels; the selected tab is the white pill. Built from radios, so they work before scripts load.

### Live preview
Discord's own dark theme inside a framed pane, sticky beside its editor, labelled "Preview in Discord". Variables in help text are color-coded chips.

### AI assistant
Garrison speaks in plain text beside its gem mark; your messages are raised bubbles. The plan panel's head carries the counts and Apply build; tabs switch Channels, Roles and Settings; its foot shows "+N new · ~N settings" and Discard.

## Do's and Don'ts

### Do:
- **Do** lead every panel with its header bar and put its switch or main action on the right of that bar.
- **Do** show state with shape and word as well as color (badges: dot on, ring waiting, triangle alert, dash off).
- **Do** put a live preview beside anything that posts to Discord.
- **Do** keep one white control per panel.
- **Do** let settings save themselves, with Undo in the toast; never add a Save button to a panel that can save itself.
- **Do** show a pick among two to four as segmented, level or preset cards, not a select.

### Don't:
- **Don't** fill buttons, panels or page areas with a section color; tint only.
- **Don't** add drop shadows to panels at rest.
- **Don't** use Peak Bot's name, logo, wording or exact layouts; Garrison's own content and shield lead.
- **Don't** put a label above a heading; the header bar's title speaks for itself.
