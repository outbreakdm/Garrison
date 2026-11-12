import { writeFileSync } from "node:fs";
import { DEFAULT_RANK_CARD } from "@garrison/db";
import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  type RankCardInput,
  rankCardPng,
  renderRankCard,
} from "./render.js";

const base: RankCardInput = {
  style: DEFAULT_RANK_CARD,
  name: "Rook of the Iron Vanguard",
  avatarUrl: null,
  level: 12,
  position: 3,
  xpInto: 640,
  xpNeeded: 1420,
  totalXp: 9140,
  details: [],
  linked: [],
};

describe("rank cards", () => {
  it("draws a PNG at the card's size, with or without details", async () => {
    const plain = await loadImage(await renderRankCard(base));
    expect([plain.width, plain.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    const pro = await renderRankCard({
      ...base,
      style: { ...DEFAULT_RANK_CARD, background: "dusk", accent: "#5ab0ff" },
      details: [
        { label: "Main", value: "Holy Paladin" },
        { label: "Realm", value: "Silvermoon" },
      ],
      linked: ["OSRS · Zezima · total 2277 · combat 126"],
    });
    expect(pro.subarray(1, 4).toString()).toBe("PNG");
    if (process.env.RANK_CARD_OUT) {
      writeFileSync(`${process.env.RANK_CARD_OUT}/rank-free.png`, await renderRankCard(base));
      writeFileSync(`${process.env.RANK_CARD_OUT}/rank-pro.png`, pro);
    }
  });

  it("never fetches a background or avatar from outside Discord's CDN", async () => {
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      throw new Error("offline");
    }) as typeof fetch;
    try {
      await renderRankCard({
        ...base,
        style: { ...DEFAULT_RANK_CARD, background: "https://evil.example/a.png" },
        avatarUrl: "http://169.254.169.254/latest",
      });
      await renderRankCard({ ...base, avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png" });
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toEqual(["https://cdn.discordapp.com/avatars/1/a.png"]);
  });

  it("reuses a card until something on it changes", async () => {
    const a = await rankCardPng(base);
    expect(await rankCardPng({ ...base })).toBe(a);
    expect(await rankCardPng({ ...base, xpInto: 641 })).not.toBe(a);
  });
});
