import { writeFileSync } from "node:fs";
import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { BANNER_HEIGHT, BANNER_WIDTH, renderWelcomeBanner } from "./banner.js";

describe("welcome image", () => {
  it("draws a PNG at the banner's size", async () => {
    const png = await renderWelcomeBanner({
      background: "frost",
      accent: null,
      avatarUrl: null,
      name: "Rook of the Iron Vanguard",
      server: "Iron Vanguard",
      count: 1284,
    });
    const img = await loadImage(png);
    expect([img.width, img.height]).toEqual([BANNER_WIDTH, BANNER_HEIGHT]);
    if (process.env.RANK_CARD_OUT) writeFileSync(`${process.env.RANK_CARD_OUT}/welcome.png`, png);
  });
});
