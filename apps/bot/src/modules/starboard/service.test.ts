import type { Message } from "discord.js";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { starMessage } from "./service.js";

const message = {
  channelId: "300000000000000001",
  url: "https://discord.com/channels/1/300000000000000001/2",
  content: "gg <@&200000000000000001> @everyone",
  member: { displayName: "Rook" },
  author: { username: "rook" },
  attachments: new Map([
    [
      "1",
      { name: "clip.png", url: "https://cdn.discordapp.com/a/clip.png", contentType: "image/png" },
    ],
  ]),
} as unknown as Message<true>;

describe("starboard reposts", () => {
  it("shows the count, the author's words and image, and never pings", () => {
    const m = starMessage(message, 5, "⭐", "#d4ff3a");
    expect(m.allowedMentions).toEqual({ parse: [] });
    const text = cardTexts(m).join("\n");
    expect(text).toContain("**⭐ 5** · Rook in <#300000000000000001>");
    expect(text).toContain("gg <@&200000000000000001> @everyone");
    const json = JSON.stringify(m.components[0]?.toJSON());
    expect(json).toContain("https://cdn.discordapp.com/a/clip.png");
    expect(json).toContain("Jump to message");
  });
});

describe("starboard emoji", () => {
  it("matches server emoji by ID and standard ones by character", async () => {
    const { sameEmoji } = await import("./service.js");
    expect(sameEmoji("⭐", { id: null, name: "⭐" })).toBe(true);
    expect(sameEmoji("⭐", { id: "1", name: "⭐" })).toBe(false);
    expect(sameEmoji("<:gold:320000000000000001>", { id: "320000000000000001", name: "x" })).toBe(
      true,
    );
    expect(sameEmoji("<:gold:320000000000000001>", { id: null, name: "gold" })).toBe(false);
  });
});
