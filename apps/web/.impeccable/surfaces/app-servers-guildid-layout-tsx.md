---
version: 1
slug: "app-servers-guildid-layout-tsx"
primary_target: "app/servers/[guildId]/layout.tsx"
related_targets: ["app/servers/page.tsx","app/account/page.tsx","app/login/page.tsx","app/status/page.tsx"]
---

# Dashboard (every signed-in route)

Scope: /servers, /servers/[guildId] and every module page, /account, /login, /status, /play, the 404. Mode: Operate. Owners and admins of gaming Discord servers, on desktop and phone about equally, checking what needs them and changing settings. Owner feedback (2026-11-13): the old night-watch HUD was too dark and heavy, hard to scan, generic. Dark stays the default; nothing else in the old look is sacred.

## Direction contract

THESIS: Every module has a colour identity and reads like a well-built card: name, rules text in plain sentences, state. Refuses the grey sidebar-and-cards dashboard where every page looks the same and status hides in colour alone.

OWN-WORLD: Lifted playmat dark (deep slate-blue ground, card faces two steps lighter, never black). Four identities: Safety azure, Community orchid, Gaming volt, Server steel; the page's identity colours its nav gem, title gem and primary button. Card stock: 10px corners, 1px edge, soft drop, no frames or ornaments. Foil (holographic sheen) marks Requires Pro and nothing else. One grotesque (Archivo) for display, UI and numbers, tabular figures. Status marks differ by shape: filled dot on, hollow ring waiting, triangle alert, struck dash off.

STORY: An owner opens a page, sees by colour which part of the server they're in, reads current settings as sentences, spots what needs them by shape and colour, and changes it with one obvious button. Pro needs are unmistakable.

FIRST VIEWPORT: Top bar (logo, server switcher, search, theme, account). Left rail grouped Safety, Community, Gaming, Server, each group led by its identity gem; current item raised with its gem. Page: title with identity gem, one-line intro, then the page's work cards; the primary action in the identity colour.

FORM: Card Table, position 6 of my ordered list; seed key d5461997. Raises: shape-coded state (emission-line rail); 8px grid, reflow by whole cards (grid specimen); one grotesque at a strict scale (design annual); durations drawn to scale (dance score); held 68ch reading measure (reference setting).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The landing page keeps its own world (Gabarito/Geist); whether it follows later is open.
