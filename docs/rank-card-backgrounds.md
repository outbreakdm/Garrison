# Rank card backgrounds

Two things live here: where uploaded backgrounds will be stored, and prompts for a set
of default background images that ship with Garrison.

## Where images go

| What | Where | Why |
| --- | --- | --- |
| **Default backgrounds** (the set below) | In the repo: `apps/bot/assets/backgrounds/` for drawing, and a small copy in `apps/web/public/backgrounds/` for dashboard previews | Fixed, reviewed images. No network fetch when drawing a card, so they can't fail or be swapped. |
| **Server uploads** (Pro) | Cloudflare R2 bucket `garrison-media`, served at `media.garrisonbot.com` | Same account as the Worker and the bot. No egress fees. Free tier: 10 GB stored, 1M writes and 10M reads a month. |

**To turn on R2 (owner, once):** Cloudflare dashboard → R2 Object Storage → enable it (it
asks for a payment method even on the free tier). Then Garrison can create the bucket.

How uploads will work (not built yet):

- The dashboard (Pro, Manage Server) takes PNG, JPEG or WebP up to 4 MB. It checks the
  file's real type from its bytes (not its name), re-encodes it to WebP at 2000×600, and
  stores it as `rank/<server id>/<random id>.webp`. Re-encoding strips metadata and anything
  hidden in the file.
- `isRankImage` will accept `https://media.garrisonbot.com/rank/...` alongside Discord's CDN.
  The bot still fetches from those two hosts only, with the same 4 MB and 5 s limits.
- One upload per server is kept. A new one replaces the old, and the old object is deleted.
  Uploads are deleted when a server removes Garrison.
- Images keep the dark wash the card already puts over custom backgrounds, so text stays
  readable whatever is uploaded.

## Format for every image

- **Size:** 2000 × 600 px (the card is 1000 × 300, drawn at 2× for sharpness). Generate wider
  (for example 21:9 or 3:1) and crop to exactly 10:3.
- **Safe zones** (on the 1000 × 300 card):
  - Left 260 px: the avatar circle sits at 48–228 px across, 60–240 px down. Keep it calm
    and low-detail so the round avatar stands out.
  - Top band (0–110 px down, from 270 px across): name, rank and level in large text. No bright
    spots or busy detail here.
  - Bottom band (230–300 px down): the XP bar. Keep it fairly even in tone.
  - Interest belongs in the middle and right of the frame, mid-height, and soft.
- **Tone:** dark overall. The card has no wash on default backgrounds, so the image itself must
  keep white text readable: average brightness under about 25%, no large light areas.
- **Never:** text, letters, logos, watermarks, UI, people's faces, or anything from a specific
  game, film or brand (characters, maps, emblems, art style named after a franchise).
- **Accent:** Garrison's volt green (#d4ff3a) works as a small highlight, never a large fill.
  Each preset's colours follow its existing gradient (in `RANK_BACKGROUNDS`) so the image and the
  fallback gradient match.

Paste the shared line at the end of each prompt:

> Wide 10:3 banner, dark and moody, low contrast, soft focus toward the left and top edges,
> detail concentrated in the centre-right, no text, no letters, no logos, no watermark, no
> people, no UI, original design not based on any existing game or franchise, 2000×600.

Negative prompt (for generators that take one): `text, letters, typography, logo, watermark,
signature, frame, border, UI, HUD, people, faces, characters, bright sky, overexposed,
high contrast, busy foreground`.

## The default set

Six match the existing presets (same names and colours), and four are new.

1. **Garrison** (`#0b0d10` → `#1a2028`): A top-down tactical map at night: faint topographic
   contour lines and a fine grid on near-black slate, a few thin volt-green route lines and
   small waypoint marks in the centre-right, subtle paper grain.
2. **Ember** (`#160c08` → `#4a1d0e`): Close view of a forge's cooling coals: deep charcoal
   black with glowing orange-red embers drifting up through the centre-right, heat haze, a
   few sparks, warm and dim.
3. **Frost** (`#08111c` → `#173a5c`): A frozen mountain ridge at blue hour, seen from far
   away: layered ice-blue peaks fading into mist, fine snow in the air, faint aurora light
   low on the right horizon.
4. **Forest** (`#08130d` → `#1a3f29`): A misty pine forest at dusk, silhouetted treeline
   layers receding into green fog, a faint path of light between trees centre-right,
   fireflies as tiny points.
5. **Dusk** (`#120a1d` → `#3b2160`): A violet twilight sky over a distant flat horizon:
   soft nebula-like clouds, a scattering of stars, one thin bright band of light near the
   horizon on the right.
6. **Steel** (`#111418` → `#3a4350`): Brushed dark steel armour plates with rivets and fine
   scratches, overlapping panels angled towards the right, one cool rim light along a seam.
7. **Neon** (new): A rain-soaked city rooftop at night seen from above, dark wet surfaces
   reflecting small cyan and magenta signs far in the distance, heavy blur, mostly
   shadow.
8. **Arcane** (new): A faint glowing rune circle drawn on dark stone, thin teal and gold
   lines, floating dust motes, only partly visible as if lit by a single candle off-frame.
9. **Abyss** (new): The deep ocean looking up: dark navy water, soft god rays from far above
   on the right, small bioluminescent particles, no creatures.
10. **Dune** (new): Desert dunes under a starry night, long sand ridges in deep umber and
    indigo, starlight on the crests, a thin glow on the far horizon right.

## Before they ship

- Check each image on a real card with a long name, a 3-digit level and four details, in
  Discord's light and dark themes.
- Keep the source prompt and the generator's terms for each image in
  `apps/bot/assets/backgrounds/SOURCES.md`, and only use images whose terms allow commercial use.
- Compress to WebP (around 150 KB each for the bot copy, around 40 KB for the 1000 × 300 web
  preview).
