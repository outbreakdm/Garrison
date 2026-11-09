// Shrinks raw exports in apps/web/public/art to what the site should serve.
// Run with `pnpm art:optimize`, then `pnpm art`.
//
// Each PNG or JPG named after a slot is cropped to the slot's shape, resized to
// its size, and written as WebP (JPG for slots that ask for it, like `og`).
// The raw file is removed afterwards: keep your originals somewhere else.

import { readdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// sharp ships with Next.js, so it's resolved from there rather than added as a dependency.
const web = path.join(import.meta.dirname, "../apps/web");
const fromWeb = createRequire(path.join(web, "package.json"));
const sharp = createRequire(fromWeb.resolve("next/package.json"))("sharp");
const dir = path.join(web, "public/art");
const slots = new Map(
  JSON.parse(readFileSync(path.join(web, "art/slots.json"), "utf8")).slots.map((s) => [s.name, s]),
);

for (const file of readdirSync(dir)) {
  const { name, ext } = path.parse(file);
  const slot = slots.get(name);
  const format = slot?.format ?? "webp";
  if (!slot || ![".png", ".jpg", ".jpeg"].includes(ext.toLowerCase())) continue;
  const from = path.join(dir, file);
  const to = path.join(dir, `${name}.${format}`);
  const before = statSync(from).size;
  const image = sharp(readFileSync(from)).resize(slot.width, slot.height, {
    fit: "cover",
    withoutEnlargement: true,
  });
  await (format === "jpg"
    ? image.jpeg({ quality: 84, mozjpeg: true })
    : image.webp({ quality: 80 })
  ).toFile(`${to}.tmp`);
  // Written beside the source first, so a JPG can replace a JPG.
  unlinkSync(from);
  renameSync(`${to}.tmp`, to);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`${file} (${kb(before)}) -> ${name}.${format} (${kb(statSync(to).size)})`);
}
