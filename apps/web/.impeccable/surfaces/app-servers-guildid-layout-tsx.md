---
version: 1
slug: "app-servers-guildid-layout-tsx"
primary_target: "app/servers/[guildId]/layout.tsx"
related_targets: ["app/servers/page.tsx","app/account/page.tsx","app/login/page.tsx","app/status/page.tsx"]
---

# Dashboard (every signed-in route)

Scope: /servers, /servers/[guildId] and every module page, /account, /login, /status, /play, the 404. Mode: Operate. Owners and admins of gaming Discord servers, on desktop and phone about equally, checking what needs them and changing settings. Owner direction (2026-11-15): our own style with heavy Peak Bot inspiration (flat near-black console, panel header bars, live previews beside editors, white primary actions). Replaces Card Table (2026-11-13). Garrison keeps its name, shield, Archivo and its four section colors; nothing of Peak's brand is used.

## Direction contract

THESIS: The server's control room: flat panels on a near-black floor, each with a header bar that names it, counts it and switches it, and every message editor beside its live Discord preview. Refuses the tinted card-table look and the gray dashboard where status hides in prose.

OWN-WORLD: Ground #0b0c0e; panels #131418 with 1px #26282f hairlines; raised #1b1c21. Panel = header bar (tinted icon tile in the section color, title, count pill, switch or action on the right) over a hairline, then body. Primary action is a white button with black ink; switches are white when on. Section colors (Safety cobalt, Community orchid, Gaming volt, Server steel) only tint icon tiles, nav gems and focus; volt marks live/on. Radii 14 panels, 9 controls, 6 chips. Dashed tiles for "make a new one". Archivo only, 13 to 14px UI, tabular figures.

STORY: An owner lands, sees the server's sections down a full-height rail, opens one, reads each panel's state from its header, flips or edits it in place, and checks the preview before saving.

FIRST VIEWPORT: Full-height left rail: logo, server card (switch servers), grouped nav with gems, plan card at the foot. Slim top bar: search, theme, account. Page: icon tile and title on one line, short intro, then panels on a 2/3 + 1/3 grid; primary white button top-right of the panel it belongs to.

FORM: User-pinned direction (Peak Bot-inspired console); no concept-seed roll. Signature move: the panel header bar that carries state.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The landing page keeps its own world (Gabarito/Geist); its dashboard mockups pick up the new tokens.
- Phase 2 (AI builder workspace with a live plan panel) and phase 3 (module pages as editor + preview) follow phase 1 (foundation and shell).
