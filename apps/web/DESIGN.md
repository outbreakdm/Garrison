---
name: Garrison
description: "Guard the gate. Rally the squad. The dashboard as a card table: every module a colour identity, read like a well-built card."
colors:
  table: "#151a2c"
  card-face: "#1e2540"
  card-raised: "#283152"
  card-edge: "#3a4570"
  text: "#eef1fa"
  text-muted: "#a9b2cf"
  go: "#2bd99f"
  caution: "#ffb547"
  alert: "#ff6b6b"
  intel: "#5ab0ff"
  azure: "#5aa9ff"
  azure-ink: "#04162b"
  azure-text: "#7dbcff"
  orchid: "#c39bff"
  orchid-ink: "#1c0a38"
  orchid-text: "#cfb0ff"
  volt: "#d4ff3a"
  volt-ink: "#141a00"
  volt-text: "#d4ff3a"
  steel: "#a9bdd6"
  steel-ink: "#0f1824"
  steel-text: "#bccbe0"
  foil-ink: "#2b1a46"
  table-light: "#eceff7"
  card-face-light: "#ffffff"
  card-raised-light: "#f2f4fa"
  card-edge-light: "#c8cfe2"
  text-light: "#141a2e"
  text-muted-light: "#4d5779"
  go-light: "#0b7a57"
  caution-light: "#9a5b00"
  alert-light: "#c62828"
  intel-light: "#1f6fc5"
  azure-light: "#1f6fd6"
  azure-text-light: "#1a62bf"
  orchid-light: "#7b45d6"
  orchid-text-light: "#6c3bc4"
  volt-light: "#4d6b00"
  steel-light: "#4a5d75"
  steel-text-light: "#45576e"
  identity-ink-light: "#ffffff"
  discord-bg: "#313338"
  discord-container: "#2b2d31"
  discord-text: "#dbdee1"
  discord-muted: "#949ba4"
  discord-blurple: "#5865f2"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 750
    lineHeight: "36px"
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 110"
  readout:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: "36px"
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "28px"
    fontVariation: "'wdth' 106"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: "24px"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  body-sm:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  meta:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
  code:
    fontFamily: "ui-monospace, Cascadia Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  tile: "14px"
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
    backgroundColor: "{colors.volt}"
    textColor: "{colors.volt-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.card-raised}"
  button-ghost:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.card-raised}"
    textColor: "{colors.text}"
  button-danger:
    textColor: "{colors.alert}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-danger-hover:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.table}"
  button-sm:
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  badge:
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px 2px 7px"
  pro-tag:
    textColor: "{colors.foil-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px 2px 7px"
  switch:
    backgroundColor: "{colors.card-raised}"
    rounded: "{rounded.pill}"
    width: "38px"
    height: "22px"
  nav-item:
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "7px 10px 7px 28px"
    height: "36px"
  nav-item-current:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.text}"
  empty-mark:
    rounded: "{rounded.tile}"
    size: "56px"
  discord-container:
    backgroundColor: "{colors.discord-container}"
    textColor: "{colors.discord-text}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
---

# Design System: Garrison

## Overview

**Creative North Star: "The Card Table"**

Every module of a server has a colour identity and reads like a well-built card: a name, rules text in plain sentences, and its state. An owner opens a page, sees by colour which part of the server they are in, reads the current settings as sentences, spots what needs them by shape and colour, and changes it with one obvious button. Pro needs are unmistakable. The system refuses the grey sidebar-and-cards dashboard where every page looks the same and status hides in colour alone.

The world is a lifted playmat at night: a deep slate-blue table, card faces two steps lighter, never black. Four identities divide the server: **Safety** is azure, **Community** orchid, **Gaming** volt, **Server** steel, and Overview takes Garrison's own volt. The current page's identity colours its nav gem, the gem beside its title, its section tag, its primary button, its switches, its settings gear plates and the edge of the panel you have open. Card stock is plain: 10px corners, a 1px edge, a soft drop, no frames or ornaments. Foil, a holographic sheen, marks what requires Pro and nothing else.

One grotesque, Archivo, carries display, interface and numbers, with tabular figures wherever something is counted or timed; only code and diffs drop to a system monospace. State is never colour alone: each state has its own shape. Durations are drawn to scale, so a long wait looks long. The layout reflows by whole cards on an 8px grid and holds a 68-character reading measure.

This system replaces the earlier "night-watch HUD" world (near-black ground, Saira Semi Condensed / Inter / JetBrains Mono, chamfered buttons, HUD corner brackets, lime on everything, lock-on and glint motion). None of that survives in the dashboard: the HUD lock-on brackets and the glint sweep are gone with it. The landing page (`/`, `app/landing.css`, Gabarito and Geist) keeps its own world and is not part of this system.

Motion explains state and keeps your place, and it is quick because switching pages is work, not a show. Page changes swap the content under a still top bar and rail (old page out in 0.1s, new page rises 10px in 0.2s) while the current-page gem slides to its new item (0.34s, snap easing). Panels open by height (0.32s); a notice drops in and its mark pings twice; new seats and rows pop or fade in; XP gauges, seat bars and uptime sweep in from the left; a submitting button carries a moving line; the Pro tag's foil sweeps once. Distances are tokens that reduced motion sets to zero, keeping fades and colour changes; sweeps become fades and the sending line blinks instead.

**Key Characteristics:**
- Dark-first slate-blue table with a full light theme (cookie-driven `data-theme` on `<html>`).
- Four identity colours, chosen by the page you are on, never by decoration.
- Card stock: 10px faces, 1px edge, soft drop, nothing ornamental.
- Status by shape and colour together: filled dot, hollow ring, triangle, struck dash.
- One grotesque (Archivo, variable width and weight), tabular numbers, a strict scale.
- Foil is Pro, and only Pro.
- Strict CSP: classes only, no inline style attributes; fonts self-hosted through next/font.

## Colors

A cool slate-blue ramp for the table and cards, four saturated identity colours that say where you are, and four status colours that only ever report state.

### Primary (the four identities)
Each identity has three tokens: a **fill** for buttons, gems and switches; an **ink** for text and marks on that fill; and a **text** tone safe for links, strokes and small type on the card face. In light theme every ink is white and the fills darken so white text clears contrast.

- **Safety Azure** (`azure`, `azure-ink`, `azure-text`): Moderation, Security, Logs.
- **Community Orchid** (`orchid`, `orchid-ink`, `orchid-text`): Welcome, Role menus, Tickets, Leveling, Giveaways, Starboard, Stream alerts, Messages.
- **Gaming Volt** (`volt`, `volt-ink`, `volt-text`): Groups and raids, Game accounts, and Overview. Volt is also the accent on pages outside a server (server picker, sign-in, account). In light theme volt becomes a deep olive (`volt-light`) so it reads as text.
- **Server Steel** (`steel`, `steel-ink`, `steel-text`): AI builder, Settings, Plan.

The shell resolves the current page's identity into the working accent: the page picks its identity from the menu item marked current, and every accent-driven control on the page (primary button, switches, selection, focus ring, text links, filled seats, XP gauges, gear plates, open-panel edge, empty-state tile) follows it.

### Secondary (status, state only)
- **Go Green** (`go`): on, done, online, verified, what a plan adds.
- **Caution Amber** (`caution`): waiting, needs attention soon, short-handed.
- **Alert Red** (`alert`): needs you now, lockdown on, failures, destructive actions.
- **Intel Blue** (`intel`): neutral information (waiting on a member, not built yet, a purge).

### Tertiary (Pro)
- **Foil**: a six-stop holographic gradient at 115deg (pink, periwinkle, mint, pale lime, peach, lilac) printed on the Requires Pro tag, the edge of a Pro notice and its diamond mark. Text on foil is **Foil Ink** (`foil-ink`). The gradient lives in the sidecar; it is not a flat colour.

### Neutral
- **Slate Table** (`table`): the page ground and top bar. Never black.
- **Card Face** (`card-face`): cards, the current nav item, secondary buttons.
- **Raised Card** (`card-raised`): hover fills, nested plates, switch tracks, skeleton bars, the embed preview. A sunken mix (55% card face into table) heads tables.
- **Card Edge** (`card-edge`): every 1px border, hairline divider and readout split.
- **Chalk** (`text`) and **Slate Mist** (`text-muted`): primary and secondary text.
- **Discord neutrals** (`discord-*`): Discord's own dark chat colours, used only inside Discord previews.

### Named Rules
**The You Are Here Rule.** Identity colour comes from the page you are on and nothing else. A Safety page is azure from its menu gem to its primary button; it never borrows orchid for variety, and a module never picks a colour for itself.

**The Status Is State Rule.** Go, caution, alert and intel report state and nothing else: never a category colour, a section accent or a flourish. Bot embeds in Discord follow the same rule.

**The Foil Is Pro Rule.** The holographic sheen marks "Requires Pro" and nothing else on the dashboard. No foil buttons, headings, highlights or celebrations.

## Typography

**Display Font:** Archivo (variable `wdth` and `wght`), self-hosted with next/font, falling back to system-ui
**Body Font:** Archivo
**Numbers:** Archivo with tabular figures
**Code Font:** system monospace (`ui-monospace`, Cascadia Mono, Menlo, Consolas), for code and diffs only

**Character:** One sturdy grotesque at a strict scale, widened a little for titles (width 106 to 112%) so headings have presence without a second face. Numbers line up because every counted or timed value uses tabular figures.

### Hierarchy
- **Display** (750, 30px/36px, width 110%, -0.01em): the page title, preceded by the identity gem and followed by the section tag.
- **Readout** (650, 30px/36px, tabular, -0.01em): the big numbers in a page's readout strip; a worded value drops to 650 21px.
- **Headline** (700, 20px/28px, width 106%): a block of the page.
- **Title** (650, 17px/24px): the title of one card, and empty-state titles. Table-card heads use 16px/22px.
- **Body** (400, 15px/22px): page copy. Card copy, help text and card subtitles hold a 68ch measure.
- **Body small** (400 to 600, 14px/20px): buttons (600), inputs, nav items, table cells, card subtitles.
- **Meta** (400, 13px/18px, tabular): times, counts, IDs, panel facts, help lines.
- **Label** (600, 12px/16px): field names, badges, the section tag, nav group names. Sentence case, no tracking.
- **Code** (400, 13px/20px system mono): diffs and code blocks; 12px/18px in the card editor's placeholders.

The wordmark is Archivo 800 at width 112%, -0.01em, sentence case.

### Named Rules
**The One Voice Rule.** Archivo is the only face in the dashboard's own chrome. The system monospace appears only where columns of code must line up.

**The Sentence Case Rule.** Every heading, label, badge and button is in sentence case with no letter-spacing. Uppercase appears only inside Discord replicas, because Discord itself sets it there.

**The Strict Scale Rule.** Sizes come from the scale above (12, 13, 14, 15, 16, 17, 20, 30). A new size needs a reason that the scale cannot meet.

## Layout

An 8px grid (4px for fine steps: 4, 8, 12, 16, 24, 32, 48). The shell is capped at 1400px and centred, with 24px padding and gaps: a 232px side rail beside a main column that shrinks rather than wrapping under it. Above phones the top bar is sticky and the rail sticks 84px from the top. Pages stack their blocks with 24px gaps; cards in a grid sit 16px apart.

Cards reflow by whole cards: grids are `auto-fit` with a minimum card width (280px for card grids, 200px for stats, 230px for moderation, 260px for settings fields) and align to the top, so a card opening its form never stretches its neighbours. Overview runs three columns, two below 1100px and one below 720px. Paired layouts (Security, global settings) collapse to one column below 960px. Readout strips go from four (or three) cells to two below 900px.

Phones (720px and below): the side rail becomes one scrolling row that keeps the current page centred; page-head actions stack full width with the primary first; head shortcuts to a form already just below the title are hidden; filter rows scroll on one line and fade at their right edge. At 520px and below the top bar becomes one row of controls with search below it, panel facts drop under their title, and empty states stack mark over text.

**The Held Measure Rule.** Copy in a card stops at 68 characters; page intros under the title do too. Wide screens get more cards, never longer lines.

## Elevation & Depth

Lifted, but quietly: cards sit on the table with a soft drop and a faint top highlight, the way a card lies on a mat. Depth has three steps and they are tokens.

### Shadow Vocabulary
- **Card** (dark: `0 1px 0 rgb(255 255 255 / 0.04) inset, 0 2px 6px -2px rgb(4 7 20 / 0.55)`): every card face, the current nav item, LFG cards. A card inside a card has no shadow.
- **Lift** (dark: `0 1px 0 rgb(255 255 255 / 0.06) inset, 0 16px 32px -14px rgb(4 7 20 / 0.8)`): a server tile on hover or focus, with a 2px rise.
- **Overlay** (dark: `0 12px 32px -6px rgb(4 7 20 / 0.7)`): dialogs.
- **Open panel ring**: an open settings panel adds a 1px ring of its identity colour at 25% around the card shadow, and its edge takes the identity at 60%.

Light theme uses the same three roles with lower-opacity slate-ink shadows (in the sidecar).

**The Soft Drop Rule.** Shadows are soft and downward. No hard offset shadows, no glows, no inner frames.

## Shapes

Card stock: **10px** for card faces (cards, server tiles, LFG cards), **8px** for controls (buttons, inputs, nav items, embed and Discord previews, readout strips), **6px** for chips of state (badges, the section tag, the Pro tag, slots, the empty-art frame), and **14px** for icon tiles (the empty-state mark, a large server icon). Switches, chips, XP and duration bars are full pills. Gems are 8px squares (12px beside the title) rotated 45deg with 2 to 3px corners: a cut stone, not a pip. Every edge is 1px.

**The Plain Stock Rule.** No chamfers, no corner brackets, no glints, no frames or ornaments. A card is a rounded rectangle with an edge and a drop.

## Components

### Buttons
Confident and few: one obvious primary per first viewport.
- **Shape:** 8px corners, 36px minimum height, 8px by 14px padding, 600 14px label, never wrapping.
- **Primary:** the page's identity fill with its ink, a faint top highlight (`0 1px 0 rgb(255 255 255 / 0.18) inset, 0 1px 2px rgb(4 7 20 / 0.3)`). Hover mixes 12% of the text colour in.
- **Secondary:** card face with a 1px edge; hover raises the fill and darkens the edge.
- **Ghost:** muted text only; hover takes the raised fill.
- **Danger:** alert text and an alert-tinted edge; hover fills alert with table-colour text.
- **Small:** 4px by 10px, 13px/18px, for actions inside rows and empty states.
- **States:** pressed buttons sink 1px; disabled at 45% opacity; focus is a 2px ring in the page's identity text tone, offset 2px. A submitting button carries a 2px moving line along its foot and cannot be pressed twice.

### Badges (state marks)
A state said in a word and drawn as a shape, so colour is never the only sign. 600 12px/16px, 6px corners, tone at 10% fill and 40% edge.
- **On** (go, or the page's identity for an open or current thing): a filled dot.
- **Waiting** (caution): a hollow ring.
- **Needs you** (alert): a triangle.
- **Off**: a struck dash in muted grey.
- **Information** (intel): a small diamond.
- **Plain tag** (no tone): a role, a log type; no mark at all.
- **Kind tag**: case actions (warn, timeout, kick, ban, purge) are kinds, not states, so they print as coloured words with no mark.

The same shapes recur at larger sizes: notices lead with the triangle (alert) or dot (done); the Needs attention list leads each line with a ring (caution) or triangle (alert); readout values that report a state carry the shape before the word.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** card face on the slate table.
- **Shadow Strategy:** the Card shadow; nested cards are flat.
- **Border:** 1px card edge. A card that reports a state can take that state's edge (lockdown on: alert edge and a 6% alert wash; Needs attention: caution edge).
- **Internal Padding:** 16px; table cards run flush with a 12px by 16px head.

### Settings panels
A card whose closed row reads the current settings as a sentence of label and value facts, led by a 28px gear plate in the page's identity (12% fill, 35% edge) and ended by a real "Change" control. Open means you are editing: the card takes its identity edge and ring, the gear plate brightens, and the body slides open by height.

### Inputs / Fields
- **Style:** 36px minimum, 8px corners, 1px edge, a fill 45% of the way from card face to table, 400 14px text.
- **Focus:** the edge turns to the focus colour and a 2px focus ring appears; hover darkens the edge.
- **Error:** alert edge with alert help text below.
- **Selects:** drawn chevron, no system arrow.
- **Switches:** real checkboxes drawn as a 38 by 22px pill; on fills with the page's identity and the knob takes its ink.

### Navigation
- **Side rail:** 232px. Groups (Safety, Community, Gaming, Server) are 600 12px muted names led by their identity gem. Items are 36px rows in muted 14px text. The current item is a raised card (card face, edge, card shadow, 600 weight) with its identity gem in its left gutter; moving pages slides that gem from the old item to the new one.
- **Page head:** the title with its identity gem before it and a section tag after it (the group name in the identity colour on a 12% tint, 6px corners, 600 12px), a muted intro under it, and the page head's rule tinted 22% toward the identity.
- **Phones:** the rail becomes one horizontally scrolling row with the current item kept in view.

### Pro tag
"Requires Pro" in words with a lock, printed in foil: 700 12px/16px Foil Ink on the foil gradient, 6px corners, a white 55% edge and a faint orchid outline. The sheen sweeps once across the tag on arrival. A Pro notice takes a foil border and a foil diamond as its mark.

### Duration bars
Time drawn to scale with the same span said in words beside it: a ticket's wait out of two days, a raid's countdown out of a week, a lockdown's time served out of its length. A real progress element, 6px (4px inside a ticket row), full pill, filled in the identity text tone, or caution or alert when the wait is long.

### Readout
The numbers of a page in one strip, four or three cells split by 1px hairlines inside one card, each with a label, a 30px tabular value and a help line.

### Empty states
What will appear here and the one thing to do about it: a drawn line mark (1.5px stroke, 28px) on a 56px tile with 14px corners in the page's identity (12% fill, 35% edge), a 17px title, muted body, and one small secondary button. Inside a list card it drops its own card. A drawn mark, not a painting, so it reads in both themes and never fails to load.

### Discord previews (an intentional exception)
Discord messages, Components V2 containers, the profile card and the server channel list are reproduced in Discord's own look: Discord's dark neutrals, blurple App tag, 40px round avatar, and the **4px coloured bar on the container's left edge**. They keep Discord's uppercase where Discord uses it (the App tag, channel categories) and stay dark in both themes. The bar and the uppercase belong to Discord's anatomy and appear only inside these replicas.

## Do's and Don'ts

### Do:
- **Do** take the identity from the page's menu item and let it colour the gem, title gem, section tag, primary button, switches, gear plates and open-panel edge.
- **Do** give every state its shape: filled dot on, hollow ring waiting, triangle needs you, struck dash off; use a plain tag (no tone) for roles and types, and a kind tag for case actions.
- **Do** write current settings as plain sentences and say what happened and what to do next.
- **Do** keep one primary button per first viewport, in the page's identity colour.
- **Do** draw durations to scale beside their words, and use tabular figures for anything counted or timed.
- **Do** hold card copy to 68ch and reflow by whole cards on the 8px grid.
- **Do** use classes only: the CSP blocks inline style attributes. Fonts are self-hosted through next/font.
- **Do** source pictures from `public/art` by slot, with prompts in `art/PROMPTS.md` (generated from `art/slots.json`); a slot with no file renders nothing, so every layout must read complete without its art.

### Don't:
- **Don't** put eyebrow labels or kickers above headings.
- **Don't** use uppercase captions or tracked-out labels, except inside Discord replicas.
- **Don't** use chamfers, corner brackets, glints, frames or ornaments.
- **Don't** use foil for anything but Requires Pro.
- **Don't** let colour be the only sign of a state.
- **Don't** use status colours (go, caution, alert, intel) as category or decoration colours.
- **Don't** put a coloured side bar on a card, notice or row outside a Discord replica.
- **Don't** use black or near-black grounds; the table is slate blue.
- **Don't** add a second display or UI face, or use monospace outside code and diffs.
