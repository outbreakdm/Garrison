// Art pipeline for the website. Run with `pnpm art`.
//
//   apps/web/art/slots.json      what art the site has room for, and the prompt for each piece
//   apps/web/public/art/         drop finished files here, named after the slot (hero.webp, …)
//   apps/web/art/PROMPTS.md      written by this script: one copy-paste prompt per slot
//   apps/web/lib/art.generated.json   written by this script: what the site actually shows
//
// A slot with no file shows nothing, so the site is always safe to deploy.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const web = path.join(import.meta.dirname, "../apps/web");
const dir = path.join(web, "public/art");
const spec = JSON.parse(readFileSync(path.join(web, "art/slots.json"), "utf8"));
const EXT = [".webp", ".png", ".jpg", ".jpeg"];
/** Above this a picture slows the page down more than it adds. */
const HEAVY = { hero: 450_000, default: 250_000 };

/** Pixel size from the file header, so the page can reserve the space before the image loads. */
function size(buf, ext) {
  if (ext === ".png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (ext === ".webp") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X")
      return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    if (kind === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  // JPEG: walk the segments to the frame header.
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

mkdirSync(dir, { recursive: true });
const files = readdirSync(dir).filter((f) => EXT.includes(path.extname(f).toLowerCase()));
const known = new Set(spec.slots.map((s) => s.name));
const out = {};
const notes = [];

for (const slot of spec.slots) {
  const matches = files.filter((f) => path.parse(f).name === slot.name);
  // Prefer the smaller format when a slot has more than one file.
  const file = matches.sort(
    (a, b) =>
      EXT.indexOf(path.extname(a).toLowerCase()) - EXT.indexOf(path.extname(b).toLowerCase()),
  )[0];
  if (!file) continue;
  const buf = readFileSync(path.join(dir, file));
  const dims = size(buf, path.extname(file).toLowerCase());
  if (!dims?.width || !dims?.height) {
    notes.push(`! ${file}: couldn't read its size, skipped. Re-export it as WebP or PNG.`);
    continue;
  }
  // The hash changes the URL whenever the picture changes, so browsers never show a stale one.
  const v = createHash("sha256").update(buf).digest("hex").slice(0, 10);
  out[slot.name] = { src: `/art/${file}?v=${v}`, ...dims, alt: slot.alt };
  const want = slot.width / slot.height;
  if (Math.abs(dims.width / dims.height - want) / want > 0.03)
    notes.push(
      `! ${file} is ${dims.width}×${dims.height}; the slot is ${slot.width}×${slot.height}. It will be cropped to fit.`,
    );
  const limit = HEAVY[slot.name] ?? HEAVY.default;
  if (buf.length > limit)
    notes.push(
      `! ${file} is ${Math.round(buf.length / 1024)} KB; aim for under ${limit / 1000} KB (export as WebP, quality about 80).`,
    );
  if (matches.length > 1)
    notes.push(`  ${slot.name}: using ${file}, ignoring ${matches.length - 1} other file(s).`);
}
for (const f of files)
  if (!known.has(path.parse(f).name))
    notes.push(
      `! ${f} doesn't match any slot name, so nothing shows it. See apps/web/art/PROMPTS.md.`,
    );

writeFileSync(path.join(web, "lib/art.generated.json"), `${JSON.stringify(out, null, 2)}\n`);

// --- PROMPTS.md: every prompt assembled and ready to paste.
const full = (s) =>
  [s.styleOverride ?? spec.style, s.prompt, s.emblem ? spec.emblem : null]
    .filter(Boolean)
    .join("\n\n");
const md = [
  "# Garrison art prompts",
  "",
  "Written by `pnpm art` from `slots.json`. Edit that file, not this one.",
  "",
  "## How to use",
  "",
  "1. Copy a prompt below into your image generator. Paste the negative prompt too if it has a field for one.",
  "2. Generate at the listed size, or the same shape at the largest size on offer.",
  "3. Export as WebP (quality about 80) and name it exactly as shown, for example `hero.webp`. The link preview (`og`) is the exception: export it as JPG, because some apps won't preview WebP.",
  "4. Put the file in `apps/web/public/art/` and run `pnpm art`.",
  "",
  "A slot with no file shows nothing, so pieces can arrive one at a time. Replacing a file and running `pnpm art` again swaps the picture everywhere it's used.",
  "",
  "Generate the hero first and reuse it as a style reference for the rest, so the set looks like one world.",
  "",
  "## Negative prompt (all pieces)",
  "",
  "```",
  spec.negative,
  "```",
  "",
  "## Status",
  "",
  "| Slot | File | Size | Where it shows | Have it |",
  "|---|---|---|---|---|",
  ...spec.slots.map(
    (s) =>
      `| ${s.name}${s.optional ? " (optional)" : ""} | \`${s.name}.${s.format ?? "webp"}\` | ${s.width}×${s.height} | ${s.use} | ${out[s.name] ? "yes" : "no"} |`,
  ),
  "",
  ...spec.slots.flatMap((s) => [
    `## ${s.name}`,
    "",
    `File \`${s.name}.${s.format ?? "webp"}\`, ${s.width}×${s.height}. ${s.use}`,
    "",
    "```",
    full(s),
    "```",
    "",
  ]),
].join("\n");
writeFileSync(path.join(web, "art/PROMPTS.md"), md);

const have = Object.keys(out);
const missing = spec.slots.filter((s) => !out[s.name] && !s.optional).map((s) => s.name);
console.log(`Art: ${have.length} of ${spec.slots.length} slots filled.`);
if (have.length) console.log(`  showing: ${have.join(", ")}`);
if (missing.length) console.log(`  still empty: ${missing.join(", ")}`);
for (const n of notes) console.log(n);
