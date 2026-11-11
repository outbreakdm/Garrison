# Garrison art prompts

Written by `pnpm art` from `slots.json`. Edit that file, not this one.

## How to use

1. Copy a prompt below into your image generator. Paste the negative prompt too if it has a field for one.
2. Generate at the listed size, or the same shape at the largest size on offer.
3. Export as WebP (quality about 80) and name it exactly as shown, for example `hero.webp`. The link preview (`og`) is the exception: export it as JPG, because some apps won't preview WebP.
4. Put the file in `apps/web/public/art/` and run `pnpm art`.

A slot with no file shows nothing, so pieces can arrive one at a time. Replacing a file and running `pnpm art` again swaps the picture everywhere it's used.

There are two sets. The landing page set (`lp-…`) is glossy 3D objects on an ink stage; generate `lp-hero` first and use it as the style reference for the rest of that set. The dashboard set (sign-in, empty states, 404) is the night outpost; reuse `login` as its reference. Pieces marked transparent need a PNG with a transparent background: export PNG, run `pnpm art:optimize`, and the WebP keeps the transparency.

Some pieces have their own negative prompt, shown under the prompt. Use it instead of the shared one.

## Negative prompt (dashboard set)

```
text, letters, numbers, words, logo, watermark, signature, frame, border, UI screenshot, faces, close-up people, orange, red, purple, teal, pink, rainbow, lens flare, cartoon, anime, chibi, flat vector, low detail, blurry, oversaturated, medieval castle, fantasy, swords, dragons, sunlight, blue sky
```

## Status

| Slot                            | File                         | Size      | Where it shows                                                                                                                                                                                                          | Have it |
| ------------------------------- | ---------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| lp-hero                         | `lp-hero.webp`               | 2400×2000 | Landing page, behind the whole hero in the dark theme (the headline at the top, the dashboard and Discord windows below). Hidden in the light theme and on phones.                                                      | no      |
| lp-icon-overview                | `lp-icon-overview.webp`      | 1024×1024 | Landing page, beside 'Open a server and see what needs you' (transparent).                                                                                                                                              | no      |
| lp-icon-watch                   | `lp-icon-watch.webp`         | 1024×1024 | Landing page, beside the moderation section (transparent).                                                                                                                                                              | no      |
| lp-icon-gatehouse               | `lp-icon-gatehouse.webp`     | 1024×1024 | Landing page, beside the security section (transparent).                                                                                                                                                                | no      |
| lp-icon-rally                   | `lp-icon-rally.webp`         | 1024×1024 | Landing page, beside 'From LFG post to full squad' (transparent).                                                                                                                                                       | no      |
| lp-icon-quartermaster           | `lp-icon-quartermaster.webp` | 1024×1024 | Landing page, beside the Quartermaster section (transparent).                                                                                                                                                           | no      |
| lp-icon-ledger                  | `lp-icon-ledger.webp`        | 1024×1024 | Landing page, Ledger under 'Also in the box' (transparent).                                                                                                                                                             | no      |
| lp-icon-ranks                   | `lp-icon-ranks.webp`         | 1024×1024 | Landing page, Ranks under 'Also in the box' (transparent).                                                                                                                                                              | no      |
| lp-icon-barracks                | `lp-icon-barracks.webp`      | 1024×1024 | Landing page, Barracks under 'Also in the box' (transparent).                                                                                                                                                           | no      |
| lp-cta                          | `lp-cta.webp`                | 2400×1000 | Landing page, behind the closing 'Add Garrison to your server' band in the dark theme. Hidden in the light theme and on phones.                                                                                         | no      |
| og                              | `og.jpg`                     | 1200×630  | Link preview image when the site is shared in Discord, X and elsewhere. After generating, add the Garrison logo and 'Run your Discord server from one dashboard.' in Gabarito on the empty right half before exporting. | yes     |
| login                           | `login.webp`                 | 1200×600  | Banner across the top of the sign-in card.                                                                                                                                                                              | yes     |
| not-found                       | `not-found.webp`             | 1200×600  | Banner on the 'Nothing here' page.                                                                                                                                                                                      | yes     |
| empty                           | `empty.webp`                 | 800×800   | Small picture in empty tables (no cases, no events, nobody ranked yet).                                                                                                                                                 | yes     |
| hero (optional)                 | `hero.webp`                  | 2400×1350 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| hero-light (optional)           | `hero-light.webp`            | 2400×1350 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| security (optional)             | `security.webp`              | 1600×1200 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-watch (optional)         | `module-watch.webp`          | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-gatehouse (optional)     | `module-gatehouse.webp`      | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-ledger (optional)        | `module-ledger.webp`         | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-rally (optional)         | `module-rally.webp`          | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-ops (optional)           | `module-ops.webp`            | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-barracks (optional)      | `module-barracks.webp`       | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-ranks (optional)         | `module-ranks.webp`          | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |
| module-quartermaster (optional) | `module-quartermaster.webp`  | 1024×1024 | Not shown since the landing page redesign. Kept so the existing file still has a slot.                                                                                                                                  | yes     |

## lp-hero

File `lp-hero.webp`, 2400×2000. Landing page, behind the whole hero in the dark theme (the headline at the top, the dashboard and Discord windows below). Hidden in the light theme and on phones.

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

Tall, empty studio stage for product screenshots, framed for a hero that is a little wider than it is tall. The top 40% is nearly black and completely calm, where a headline sits. Below it, a polished black floor recedes into the dark, lit by a wide, soft pool of indigo and cool blue light low in the frame, as if a large screen stands just out of view. Far in the background on the right, heavily out of focus, a tall smoked-glass shield shape whose thin edge light is the only lime in the picture. The middle and lower centre stay dark and even, because two app windows are placed on top of them. Nothing in the foreground.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-overview

File `lp-icon-overview.webp`, 1024×1024. Landing page, beside 'Open a server and see what needs you' (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A thick smoked-glass dashboard tablet with rounded corners, tilted toward the viewer. On its face, three soft horizontal bars: the top one glows volt-lime, the other two are dim frosted white. A small round lime notification dot sits on its top right corner.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-watch

File `lp-icon-watch.webp`, 1024×1024. Landing page, beside the moderation section (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A small stack of three rounded satin-graphite case cards, slightly fanned, the top card with a volt-lime tab glowing on its edge. Leaning against the stack, a chunky circular undo arrow made of smoked glass with a lime inner glow.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-gatehouse

File `lp-icon-gatehouse.webp`, 1024×1024. Landing page, beside the security section (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A sturdy rounded shield made of thick smoked glass inside a satin-graphite rim, with a warm volt-lime glow deep in its core and a small rounded padlock shape embossed at the centre, lit from within.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-rally

File `lp-icon-rally.webp`, 1024×1024. Landing page, beside 'From LFG post to full squad' (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A short curved row of five rounded pill-shaped seats on a graphite base, like a party lobby: four are filled and glow soft frosted white from inside, the fifth is empty clear smoked glass outlined by a thin volt-lime light, waiting for a player.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-quartermaster

File `lp-icon-quartermaster.webp`, 1024×1024. Landing page, beside the Quartermaster section (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

Three rounded smoked-glass building blocks snapping together into a small tidy structure, with a fourth block hovering just above its slot, glowing volt-lime as the newest addition.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-ledger

File `lp-icon-ledger.webp`, 1024×1024. Landing page, Ledger under 'Also in the box' (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A closed rounded notebook in satin graphite with faint embossed lines across its cover and a glowing volt-lime bookmark ribbon falling from its pages.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-ranks

File `lp-icon-ranks.webp`, 1024×1024. Landing page, Ranks under 'Also in the box' (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

Three rounded smoked-glass podium blocks of different heights side by side, the tallest topped by a small glowing volt-lime chevron badge.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-icon-barracks

File `lp-icon-barracks.webp`, 1024×1024. Landing page, Barracks under 'Also in the box' (transparent).

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A small fan of four rounded game-account cards in graphite and smoked glass, each with a thin soft edge light, the front card carrying a raised volt-lime check mark.

Transparent piece: one object, centred, filling about 72% of the square, three-quarter view from slightly above, on a fully transparent background (PNG with alpha). No floor, no cast shadow plane, no backdrop, no frame. Even margin on all four sides. The lime light sits on the object itself.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## lp-cta

File `lp-cta.webp`, 2400×1000. Landing page, behind the closing 'Add Garrison to your server' band in the dark theme. Hidden in the light theme and on phones.

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

A wide product-family shot on a dark glossy floor: the smoked-glass shield stands low at the right edge with its small volt-lime core, the only lime in the picture. The other objects of the set sit at different depths along the bottom and left edges, lit frosted white and graphite: the row of seats, the stacked building blocks, the closed notebook, the small podium. Indigo rim light from behind, indigo reflections in the floor. The whole centre and the top half stay calm and dark for a centred headline and buttons.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## og

File `og.jpg`, 1200×630. Link preview image when the site is shared in Discord, X and elsewhere. After generating, add the Garrison logo and 'Run your Discord server from one dashboard.' in Gabarito on the empty right half before exporting.

```
Premium 3D product render for a modern software launch page: clean high-end CGI with the polish of a flagship app's marketing art, soft studio lighting, smooth satin graphite and thick smoked-glass materials with rounded, generously bevelled edges, subtle inner glow, crisp reflections, no grunge or wear. Palette: deep ink #07080c, graphite #161a23 and #2a2f3a, smoked glass with cool grey highlights. Exactly one small volt-lime #d4ff3a light per piece, as emitted light or a lit inset, never as paint and never as ambient light. A soft indigo #6f6cf8 rim light from behind and to the left; any ambient glow or floor light is indigo or cool blue. Calm, confident and friendly: shapes simple enough to read at 48 pixels, nothing military.

The smoked-glass shield with its small volt-lime core floats at centre-left of a dark studio stage, indigo rim light from behind, a soft indigo pool of light on the glossy floor beneath it. The right half is calm, even, dark negative space reserved for a title. Strong, simple silhouette that still reads as a small thumbnail.
```

Negative prompt for this piece:

```
text, letters, numbers, words, logo, watermark, signature, UI screenshot, interface, people, faces, hands, characters, mascot, weapons, guns, swords, military, camouflage, concrete, grunge, rust, dirt, scratches, clutter, busy background, orange, red, pink, purple haze, rainbow, neon sign, cyberpunk city, cartoon outlines, flat vector, pixel art, low poly, lens flare, chromatic aberration, oversaturated, blurry
```

## login

File `login.webp`, 1200×600. Banner across the top of the sign-in card.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A small checkpoint booth beside a raised barrier arm at the garrison's entrance road, night. The booth window glows soft volt-lime from inside; a faceless silhouette stands at the window. Wet tarmac, a painted line across the road (a plain line, no markings). Wide 2:1 frame, subject slightly right of centre, edges fall to black.
```

## not-found

File `not-found.webp`, 1200×600. Banner on the 'Nothing here' page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A long, empty concrete service corridor inside the garrison that ends in a blank chamfered wall where a door should be. One volt-lime ceiling strip flickers at the far end; the rest of the lights are off. Cable trays overhead, a little dust in the air. One-point perspective, wide 2:1 frame, quiet and slightly eerie rather than threatening.
```

## empty

File `empty.webp`, 800×800. Small picture in empty tables (no cases, no events, nobody ranked yet).

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A single small watch post on a concrete plinth: a chamfered sentry box with an open shutter and one steady volt-lime lamp on its roof, a folded stool beside it, nobody there. All quiet. Must stay readable when shrunk to 120 pixels, so keep the shape simple and the lamp obvious.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## hero

File `hero.webp`, 2400×1350. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

Wide establishing shot of the garrison's main gate seen from outside at night: a massive chamfered blast door set into a concrete wall, slightly open, with a single volt-lime signal lamp above it and a thin lime light strip tracing the door's edge. A watchtower rises on the right third with one lit window. Fog rolls along wet ground that mirrors the lime glow. Composition: the gate and tower sit in the right two-thirds; the left third fades to near-black empty wall and sky for a headline to sit on. Horizon low, camera at eye level, 35mm lens.
```

## hero-light

File `hero-light.webp`, 2400×1350. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish, same world as the night pieces: chamfered 45-degree corners on every hard surface, crisp bolts and weld seams, subtle film grain, faceless distant figures only.

The same gate and watchtower as the night hero, same camera and framing, but at overcast dawn: pale grey-white fog (#f4f6f8 to #d5dbe2) fills the scene, the concrete reads as soft mid-grey, and the lamp and door strip glow a deeper olive-lime #4d6b00 instead of volt. The left third dissolves into plain pale fog for a headline. Low contrast, airy, no dark shadows heavier than #5a6472.
```

## security

File `security.webp`, 1600×1200. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

Interior of the garrison's control vault: a thick chamfered steel door, shut, with heavy locking bars and one small volt-lime lock indicator lit at its centre. Two redundant bolt mechanisms are visible, cables run in tidy trunking along the concrete wall, and a faint lime line marks the floor threshold. Straight-on, symmetrical, calm. The feeling is 'locked, and it would take two keys'.
```

## module-watch

File `module-watch.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A squat armoured watchtower head with a single rotating searchlight throwing one narrow volt-lime beam. Chamfered armour plates, a railing, a ladder cage.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-gatehouse

File `module-gatehouse.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A freestanding section of fortified gate: two interlocking chamfered blast-door halves, shut, with a thick locking bar across them and a volt-lime status light glowing in the lock housing.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-ledger

File `module-ledger.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A ruggedised field logbook: a thick metal-bound ledger lying open on a steel desk slab, its pages replaced by a dark glass panel showing rows of thin volt-lime horizontal lines (plain lines of varying length, no characters). A stylus clipped to the side.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-rally

File `module-rally.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A rally beacon: a short steel mast on a tripod base with a volt-lime signal lamp at the top and a ring of five small marker lights below it, four lit lime and one dark, as if one place is still open.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-ops

File `module-ops.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A chamfered steel briefing table with a glowing tabletop map: dark terrain relief with one volt-lime route line and a few plain lime position pips. Four empty stools around it.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-barracks

File `module-barracks.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A bank of five tall steel personnel lockers with chamfered doors and blank name-plate slots. One door stands open, a volt-lime light on inside showing a hanging jacket and a helmet on the shelf.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-ranks

File `module-ranks.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A rank insignia cast in thick gunmetal: three stacked chevrons, point up, mounted on a dark backing plate with four bolts. The top chevron is inlaid with a glowing volt-lime strip; the lower two are plain steel.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-quartermaster

File `module-quartermaster.webp`, 1024×1024. Not shown since the landing page redesign. Kept so the existing file still has a slot.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A quartermaster's bench: an open chamfered supply crate holding neatly slotted blank modules, with a compact articulated robotic arm placing one more module into the last empty slot. A volt-lime light at the arm's tip and a thin lime outline around the empty slot.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```
