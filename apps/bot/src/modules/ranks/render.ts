import { createRequire } from "node:module";
import {
  isPresetBackground,
  isRankImage,
  progressShare,
  RANK_BACKGROUNDS,
  type RankCardStyle,
  rankAccent,
} from "@garrison/db";
import {
  createCanvas,
  GlobalFonts,
  type Image,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";

/**
 * The rank card as a PNG, drawn with the brand's fonts (bundled: the container
 * has none). Images are fetched only from Discord's CDN, with a size cap and a
 * timeout, and cards are cached by everything drawn on them, so a card is
 * redrawn only when something on it changes.
 */

export const CARD_WIDTH = 1000;
export const CARD_HEIGHT = 300;

const require = createRequire(import.meta.url);
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const font = (pkg: string, file: string, family: string) =>
    GlobalFonts.registerFromPath(require.resolve(`@expo-google-fonts/${pkg}/${file}`), family);
  font("saira-semi-condensed", "700Bold/SairaSemiCondensed_700Bold.ttf", "Saira");
  font("inter", "400Regular/Inter_400Regular.ttf", "Inter");
  font("inter", "600SemiBold/Inter_600SemiBold.ttf", "Inter SemiBold");
  fontsReady = true;
}

export interface RankCardInput {
  style: RankCardStyle;
  name: string;
  avatarUrl: string | null;
  level: number;
  position: number;
  xpInto: number;
  xpNeeded: number;
  totalXp: number;
  /** Label and value pairs from the server's detail fields, in order. */
  details: { label: string; value: string }[];
  /** One line per shared game account, e.g. "OSRS · Zezima · total 2277". */
  linked: string[];
}

const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 5000;

/** Fetch an image from Discord's CDN only; anything else, too big or too slow is skipped. */
async function fetchImage(url: string | null): Promise<Image | null> {
  if (!url || !isRankImage(url)) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      redirect: "error",
    });
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)/.test(res.headers.get("content-type") ?? ""))
      return null;
    const size = Number(res.headers.get("content-length") ?? 0);
    if (size > IMAGE_MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > IMAGE_MAX_BYTES) return null;
    return await loadImage(buf);
  } catch {
    return null;
  }
}

/** Draw `img` to fill the box, cropping the overflow (CSS object-fit: cover). */
function cover(ctx: SKRSContext2D, img: Image, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Shrink `text` with an ellipsis until it fits `max` pixels. */
function fit(ctx: SKRSContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderRankCard(input: RankCardInput): Promise<Buffer> {
  registerFonts();
  const { style } = input;
  const accent = rankAccent(style);
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background: a preset gradient, or the server's image under a dark wash so text reads.
  const preset = isPresetBackground(style.background)
    ? RANK_BACKGROUNDS[style.background]
    : RANK_BACKGROUNDS.garrison;
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, preset?.from ?? "#0b0d10");
  gradient.addColorStop(1, preset?.to ?? "#1a2028");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const [bg, avatar] = await Promise.all([
    isPresetBackground(style.background) ? null : fetchImage(style.background),
    fetchImage(input.avatarUrl),
  ]);
  if (bg) {
    cover(ctx, bg, CARD_WIDTH, CARD_HEIGHT);
    ctx.fillStyle = "rgba(11, 13, 16, 0.62)";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
  // The accent bar down the left edge, as on every Garrison card.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 8, CARD_HEIGHT);

  // Avatar: a circle with an accent ring; initials when there's no image.
  const ax = 48;
  const ay = 60;
  const size = 180;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax, ay, size, size);
  else {
    ctx.fillStyle = "#1a2028";
    ctx.fillRect(ax, ay, size, size);
    ctx.fillStyle = "#e8ecf1";
    ctx.font = "72px Saira";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.name.slice(0, 1).toUpperCase(), ax + size / 2, ay + size / 2 + 4);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(ax + size / 2, ay + size / 2, size / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();

  const left = 270;
  const right = CARD_WIDTH - 44;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Rank and level, top right: small label, big number.
  ctx.textAlign = "right";
  ctx.fillStyle = accent;
  ctx.font = "56px Saira";
  const level = String(input.level);
  ctx.fillText(level, right, 92);
  const levelWidth = ctx.measureText(level).width;
  ctx.fillStyle = "#8c96a3";
  ctx.font = "18px Inter SemiBold";
  ctx.fillText("LEVEL", right - levelWidth - 12, 92);
  const levelBlock = ctx.measureText("LEVEL").width + levelWidth + 12;
  ctx.fillStyle = "#e8ecf1";
  ctx.font = "56px Saira";
  const rank = `#${input.position}`;
  ctx.fillText(rank, right - levelBlock - 36, 92);
  const rankWidth = ctx.measureText(rank).width;
  ctx.fillStyle = "#8c96a3";
  ctx.font = "18px Inter SemiBold";
  ctx.fillText("RANK", right - levelBlock - 36 - rankWidth - 12, 92);
  const statsWidth = levelBlock + 36 + rankWidth + 12 + ctx.measureText("RANK").width;

  // The name, as wide as the room left of the numbers allows.
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "48px Saira";
  ctx.fillText(fit(ctx, input.name, right - statsWidth - 24 - left), left, 92);

  // Two rows of room: details two to a row, then shared game accounts a row each.
  const colWidth = (right - left - 24) / 2;
  const details = input.details.slice(0, 4);
  details.forEach((d, i) => {
    const x = left + (i % 2) * (colWidth + 24);
    const y = 140 + Math.floor(i / 2) * 34;
    ctx.fillStyle = "#8c96a3";
    ctx.font = "16px Inter SemiBold";
    const label = d.label.toUpperCase();
    ctx.fillText(label, x, y);
    const offset = ctx.measureText(label).width + 10;
    ctx.fillStyle = "#e8ecf1";
    ctx.font = "20px Inter";
    ctx.fillText(fit(ctx, d.value, colWidth - offset), x + offset, y);
  });
  const usedRows = Math.ceil(details.length / 2);
  input.linked.slice(0, Math.max(0, 2 - usedRows)).forEach((line, i) => {
    ctx.fillStyle = "#e8ecf1";
    ctx.font = "20px Inter";
    ctx.fillText(fit(ctx, line, right - left), left, 140 + (usedRows + i) * 34);
  });

  // XP bar along the bottom, with the numbers above its right end.
  const barY = 232;
  const barH = 22;
  ctx.fillStyle = "#8c96a3";
  ctx.font = "16px Inter SemiBold";
  ctx.textAlign = "right";
  ctx.fillText(
    `${input.xpInto.toLocaleString("en-US")} / ${input.xpNeeded.toLocaleString("en-US")} XP`,
    right,
    barY - 12,
  );
  ctx.textAlign = "left";
  ctx.fillText(`${input.totalXp.toLocaleString("en-US")} XP TOTAL`, left, barY - 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  roundRect(ctx, left, barY, right - left, barH, barH / 2);
  ctx.fill();
  const share = progressShare(input.xpInto, input.xpNeeded);
  if (share > 0) {
    ctx.fillStyle = accent;
    roundRect(ctx, left, barY, Math.max(barH, (right - left) * share), barH, barH / 2);
    ctx.fill();
  }

  return canvas.encode("png");
}

const CACHE_MAX = 200;
const cache = new Map<string, Buffer>();

/** The card, from the cache when nothing on it has changed. */
export async function rankCardPng(input: RankCardInput): Promise<Buffer> {
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // Most recently used last.
    return hit;
  }
  const png = await renderRankCard(input);
  cache.set(key, png);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return png;
}
