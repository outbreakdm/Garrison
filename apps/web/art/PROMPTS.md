# Garrison art prompts

Written by `pnpm art` from `slots.json`. Edit that file, not this one.

## How to use

1. Copy a prompt below into your image generator. Paste the negative prompt too if it has a field for one.
2. Generate at the listed size, or the same shape at the largest size on offer.
3. Export as WebP (quality about 80) and name it exactly as shown, for example `hero.webp`. The link preview (`og`) is the exception: export it as JPG, because some apps won't preview WebP.
4. Put the file in `apps/web/public/art/` and run `pnpm art`.

A slot with no file shows nothing, so pieces can arrive one at a time. Replacing a file and running `pnpm art` again swaps the picture everywhere it's used.

Generate the hero first and reuse it as a style reference for the rest, so the set looks like one world.

## Negative prompt (all pieces)

```
text, letters, numbers, words, logo, watermark, signature, frame, border, UI screenshot, faces, close-up people, orange, red, purple, teal, pink, rainbow, lens flare, cartoon, anime, chibi, flat vector, low detail, blurry, oversaturated, medieval castle, fantasy, swords, dragons, sunlight, blue sky
```

## Status

| Slot                  | File                        | Size      | Where it shows                                                                      | Have it |
| --------------------- | --------------------------- | --------- | ----------------------------------------------------------------------------------- | ------- |
| hero                  | `hero.webp`                 | 2400×1350 | Landing page, behind the example messages on the right of the hero.                 | no      |
| hero-light (optional) | `hero-light.webp`           | 2400×1350 | Landing page hero in the light theme. Without it the light theme shows no hero art. | no      |
| og                    | `og.jpg`                    | 1200×630  | Link preview image when the site is shared in Discord, X and elsewhere.             | no      |
| security              | `security.webp`             | 1600×1200 | Landing page, beside the security checklist.                                        | no      |
| login                 | `login.webp`                | 1200×600  | Banner across the top of the sign-in card.                                          | no      |
| not-found             | `not-found.webp`            | 1200×600  | Banner on the 'Nothing here' page.                                                  | no      |
| empty                 | `empty.webp`                | 800×800   | Small picture in empty tables (no cases, no events, nobody ranked yet).             | no      |
| module-watch          | `module-watch.webp`         | 1024×1024 | Watch (moderation) card on the landing page.                                        | no      |
| module-gatehouse      | `module-gatehouse.webp`     | 1024×1024 | Gatehouse (security) card on the landing page.                                      | no      |
| module-ledger         | `module-ledger.webp`        | 1024×1024 | Ledger (logs) card on the landing page.                                             | no      |
| module-rally          | `module-rally.webp`         | 1024×1024 | Rally (looking for group) card on the landing page.                                 | no      |
| module-ops            | `module-ops.webp`           | 1024×1024 | Ops (events) card on the landing page.                                              | no      |
| module-barracks       | `module-barracks.webp`      | 1024×1024 | Barracks (members) card on the landing page.                                        | no      |
| module-ranks          | `module-ranks.webp`         | 1024×1024 | Ranks (leveling) card on the landing page.                                          | no      |
| module-quartermaster  | `module-quartermaster.webp` | 1024×1024 | Quartermaster (AI builder) card on the landing page.                                | no      |

## hero

File `hero.webp`, 2400×1350. Landing page, behind the example messages on the right of the hero.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

Wide establishing shot of the garrison's main gate seen from outside at night: a massive chamfered blast door set into a concrete wall, slightly open, with a single volt-lime signal lamp above it and a thin lime light strip tracing the door's edge. A watchtower rises on the right third with one lit window. Fog rolls along wet ground that mirrors the lime glow. Composition: the gate and tower sit in the right two-thirds; the left third fades to near-black empty wall and sky for a headline to sit on. Horizon low, camera at eye level, 35mm lens.
```

## hero-light

File `hero-light.webp`, 2400×1350. Landing page hero in the light theme. Without it the light theme shows no hero art.

```
Detailed digital concept painting with cinematic matte-painting finish, same world as the night pieces: chamfered 45-degree corners on every hard surface, crisp bolts and weld seams, subtle film grain, faceless distant figures only.

The same gate and watchtower as the night hero, same camera and framing, but at overcast dawn: pale grey-white fog (#f4f6f8 to #d5dbe2) fills the scene, the concrete reads as soft mid-grey, and the lamp and door strip glow a deeper olive-lime #4d6b00 instead of volt. The left third dissolves into plain pale fog for a headline. Low contrast, airy, no dark shadows heavier than #5a6472.
```

## og

File `og.jpg`, 1200×630. Link preview image when the site is shared in Discord, X and elsewhere.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

Tight, bold crop of the garrison gate at night: the chamfered blast door fills the right half, its volt-lime edge strip and signal lamp the brightest thing in frame, fog at its base. The left half is deep, almost empty near-black wall, kept clean for a logo and tagline to be added later. High contrast, reads clearly at thumbnail size.
```

## security

File `security.webp`, 1600×1200. Landing page, beside the security checklist.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

Interior of the garrison's control vault: a thick chamfered steel door, shut, with heavy locking bars and one small volt-lime lock indicator lit at its centre. Two redundant bolt mechanisms are visible, cables run in tidy trunking along the concrete wall, and a faint lime line marks the floor threshold. Straight-on, symmetrical, calm. The feeling is 'locked, and it would take two keys'.
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

## module-watch

File `module-watch.webp`, 1024×1024. Watch (moderation) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A squat armoured watchtower head with a single rotating searchlight throwing one narrow volt-lime beam. Chamfered armour plates, a railing, a ladder cage.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-gatehouse

File `module-gatehouse.webp`, 1024×1024. Gatehouse (security) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A freestanding section of fortified gate: two interlocking chamfered blast-door halves, shut, with a thick locking bar across them and a volt-lime status light glowing in the lock housing.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-ledger

File `module-ledger.webp`, 1024×1024. Ledger (logs) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A ruggedised field logbook: a thick metal-bound ledger lying open on a steel desk slab, its pages replaced by a dark glass panel showing rows of thin volt-lime horizontal lines (plain lines of varying length, no characters). A stylus clipped to the side.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-rally

File `module-rally.webp`, 1024×1024. Rally (looking for group) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A rally beacon: a short steel mast on a tripod base with a volt-lime signal lamp at the top and a ring of five small marker lights below it, four lit lime and one dark, as if one place is still open.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-ops

File `module-ops.webp`, 1024×1024. Ops (events) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A chamfered steel briefing table with a glowing tabletop map: dark terrain relief with one volt-lime route line and a few plain lime position pips. Four empty stools around it.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-barracks

File `module-barracks.webp`, 1024×1024. Barracks (members) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A bank of five tall steel personnel lockers with chamfered doors and blank name-plate slots. One door stands open, a volt-lime light on inside showing a hanging jacket and a helmet on the shelf.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-ranks

File `module-ranks.webp`, 1024×1024. Ranks (leveling) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A rank insignia cast in thick gunmetal: three stacked chevrons, point up, mounted on a dark backing plate with four bolts. The top chevron is inlaid with a glowing volt-lime strip; the lower two are plain steel.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```

## module-quartermaster

File `module-quartermaster.webp`, 1024×1024. Quartermaster (AI builder) card on the landing page.

```
Detailed digital concept painting with cinematic matte-painting finish. The setting is 'the garrison': a near-future military outpost of dark poured concrete and gunmetal steel, where every panel, door, window and crate has chamfered 45-degree cut corners instead of round ones. Night. Cold blue-black palette: shadows at #0b0d10, mid-tones #12161b and #1a2028, slate #2a323d on the lit edges. The only saturated colour anywhere is acid volt-lime #d4ff3a, used sparingly and only as emitted light: signal lamps, thin light strips, a targeting bracket, glow caught in mist. Thin ground fog, fine rain or dust drifting through the light, wet reflective surfaces. Crisp hard-surface detail, visible bolts, weld seams, cable runs and stencilled panel lines (lines only, never letters). Subtle film grain, strong readable silhouette, generous dark negative space. Any figures are small, distant, faceless silhouettes.

A quartermaster's bench: an open chamfered supply crate holding neatly slotted blank modules, with a compact articulated robotic arm placing one more module into the last empty slot. A volt-lime light at the arm's tip and a thin lime outline around the empty slot.

Composition: one object, centred, filling about 70% of the square, viewed three-quarter from slightly above, sitting on a flat pure #0b0d10 background with no horizon, no floor texture and no vignette, so it can be dropped into a dark tile. One volt-lime light source on the object itself. Even margin on all four sides.
```
