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

- **Shell:** a 256px rail beside the page from 721px up; the rail is sticky, full height and scrolls on its own. The top bar (60px) holds search, theme and account. The page is centered at up to 1280px with 24px top and 32px side padding.
- **Phones (720px and under):** no rail. The top bar keeps the logo and server switcher; the page menu is a pinned bar that opens a scrollable sheet of sections, two pages a row.
- **Page shape (redesign v2):** settings pages split into a wide main column of open panels and a side column (300 to 360px, from 1100px up) for tools and live lists: Moderate a member and what automod caught, the lockdown, quarantine and backups, top inviters and downloads. Below 1100px the side column follows the main one. Wide tables (cases, events) run full width under the split.
- **Panels stack with 16 to 24px gaps.** Saved items (role menus, messages) sit in a grid of tiles, minimum 260px wide, with a dashed "new" tile last; an opened tile spans the row.
- **Editors:** fields and a 320 to 460px preview side by side above 1100px; below that the preview comes first.
- **AI assistant:** chat beside a 340 to 400px plan panel above 1100px; the chat fills the screen height and scrolls inside.

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

A panel's own on/off (Automod, AI moderation, Anti-raid) is a switch at the far right of its header bar, after the save mark. When one action's settings are split over several panels (automod's five), each panel sends only its own fields.

Card editors (welcome, leave, DM, rank card) save themselves too: their fields are React state, so the editor tells its panel about each change (`useSaveSignal`), and a save that can't go through yet (no channel picked, a Pro field on Free) is held, with the reason under the fields and "Not saved yet" in the caution color in the header. Undo resets the editor; ordinary saves never re-create it, so focus stays where you're typing. Builders that publish to Discord (role menus, ticket panels, messages) and multi-row editors whose rows are only valid once complete (the escalation ladder, level rewards) keep an explicit Save.

### Sensitivity presets
Where a setting is a pair of numbers (spam, what counts as a raid, when anti-nuke steps in), level cards stand for them, with Custom last: Relaxed, Balanced (marked as the default in its line), Strict. Picking a card fills the numbers, which stay on the page underneath; typing your own lights the card they match, or Custom. Four cards go two by two on a phone.

### Stat tile
A label in muted 13px, the number at 26px semibold in tabular figures, then a line: the change against the range's first half (▲ in go, ▼ in caution, as a whole percent) and a sentence of context. Where the range has a series, a 12-point sparkline under it: a 2px muted line, the latest point in the page's section color. The tile's words carry the meaning; the sparkline is only the shape.

### Page tabs
For a page with views of one subject (Insights): text tabs on a hairline, the current one underlined in the section color, with the range as pills at the right of the same row. Each tab and range is a link, so a view has its own address.

### Feed
A list in the side column: one line per item, newest first, a hairline between, the time or count on the right in muted tabular figures. Empty, it says in a sentence what will show up.

### Toast
One at a time, centered at the foot of the screen: a small gem (go or alert), one sentence, a white Undo when there's something to take back, and a close. 6 s (9 s for errors), held open while hovered or focused.

### Pro sheet
Every foil "Requires Pro" tag and every "See what Pro adds" link opens the same sheet over the page, dimmed to 78% and blurred 3px: Garrison's shield drawn in foil over a faint grid, "Part of Garrison Pro", the sentence from the spot that opened it, one white button straight to Checkout, then what else Pro adds as a checklist and a line of fine print. 20px corners, the only floating thing with a lift shadow besides menus.

### Choices
A pick among a few is shown, never typed or selected. **Segmented row**: a recessed track, options sharing its width, the picked one raised with a strong edge (not white: the One White Rule holds). **Level cards**: a scale, weakest first, always one row; signal bars fill one step per card. **Preset cards**: a name (with a "Default" chip on Garrison's own setting), what it does in a few words, who it's for in a sentence. Picked cards take the page's section color on their edge and a filled ring top right. All are radios underneath.

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
Group names at 11.5px led by their gem; items 34px, muted, raised on hover; the current page is the white pill with its gem still in it. The server card on top shows the server's initial in a tinted tile, its name and "Switch server". The plan card at the foot names the plan with one line and a button.

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
