import { isPresetBackground, RANK_BACKGROUNDS, STANDARD_ACCENT } from "@garrison/db";
import { createCanvas } from "@napi-rs/canvas";
import { cover, fetchImage, fit, registerFonts } from "../ranks/render.js";

/**
 * The welcome image (Pro): the new member's avatar, "Welcome", their name and
 * their member number, on a preset background or the server's own image (fetched
 * only from Discord's CDN). Drawn with the rank card's fonts and helpers.
 */

export const BANNER_WIDTH = 1000;
export const BANNER_HEIGHT = 360;

export interface BannerInput {
  background: string;
  accent: string | null;
  avatarUrl: string | null;
  name: string;
  server: string;
  count: number;
}

export async function renderWelcomeBanner(input: BannerInput): Promise<Buffer> {
  registerFonts();
  const accent = input.accent ?? STANDARD_ACCENT;
  const canvas = createCanvas(BANNER_WIDTH, BANNER_HEIGHT);
  const ctx = canvas.getContext("2d");
  const preset = isPresetBackground(input.background)
    ? RANK_BACKGROUNDS[input.background]
    : RANK_BACKGROUNDS.garrison;
  const gradient = ctx.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  gradient.addColorStop(0, preset?.from ?? "#0b0d10");
  gradient.addColorStop(1, preset?.to ?? "#1a2028");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  const [bg, avatar] = await Promise.all([
    isPresetBackground(input.background) ? null : fetchImage(input.background),
    fetchImage(input.avatarUrl),
  ]);
  if (bg) {
    cover(ctx, bg, BANNER_WIDTH, BANNER_HEIGHT);
    ctx.fillStyle = "rgba(11, 13, 16, 0.6)";
    ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  }

  // Avatar, centred above the words, with an accent ring.
  const size = 150;
  const cx = BANNER_WIDTH / 2;
  const cy = 112;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, cx - size / 2, cy - size / 2, size, size);
  else {
    ctx.fillStyle = "#1a2028";
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = "#e8ecf1";
    ctx.font = "64px Saira";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.name.slice(0, 1).toUpperCase(), cx, cy + 4);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accent;
  ctx.font = "22px Inter SemiBold";
  ctx.fillText(fit(ctx, `WELCOME TO ${input.server.toUpperCase()}`, BANNER_WIDTH - 120), cx, 238);
  ctx.fillStyle = "#ffffff";
  ctx.font = "56px Saira";
  ctx.fillText(fit(ctx, input.name, BANNER_WIDTH - 120), cx, 296);
  ctx.fillStyle = "#8c96a3";
  ctx.font = "20px Inter";
  ctx.fillText(`Member #${input.count.toLocaleString("en-US")}`, cx, 330);
  return canvas.encode("png");
}
