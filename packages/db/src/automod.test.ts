import { describe, expect, it } from "vitest";
import {
  aiFlags,
  checkAutomod,
  checkMessageText,
  cleanWords,
  DEFAULT_AUTOMOD,
  isSpam,
  readAutomod,
} from "./automod";
import { entitlements } from "./plans";

const free = entitlements("free");
const pro = entitlements("pro");
const form = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  invites: true,
  mentionLimit: 5,
  spamCount: 6,
  spamSeconds: 8,
  words: "",
  action: "warn",
  timeoutMinutes: 10,
  aiCategories: ["hate"],
  ...over,
});

describe("automod rules", () => {
  it("matches blocked words as whole words, through look-alike tricks", () => {
    const c = { ...DEFAULT_AUTOMOD, words: cleanWords("Scam\nfree nitro") };
    expect(checkMessageText(c, { text: "this is a SCAM", mentions: 0 })).toEqual({
      rule: "word",
      detail: "scam",
    });
    expect(checkMessageText(c, { text: "s\u200Bcam", mentions: 0 })?.rule).toBe("word");
    expect(checkMessageText(c, { text: "claim your free nitro!", mentions: 0 })?.rule).toBe("word");
    expect(checkMessageText(c, { text: "scampi for dinner", mentions: 0 })).toBeNull();
  });

  it("removes other servers' invites, keeps this server's, and caps mentions", () => {
    const c = { ...DEFAULT_AUTOMOD };
    expect(checkMessageText(c, { text: "join discord.gg/abc123", mentions: 0 })).toEqual({
      rule: "invite",
      detail: "abc123",
    });
    expect(
      checkMessageText(
        c,
        { text: "discord.com/invite/ours", mentions: 0 },
        (code) => code === "ours",
      ),
    ).toBeNull();
    expect(checkMessageText(c, { text: "hi", mentions: 6 })?.rule).toBe("mentions");
    expect(checkMessageText({ ...c, mentionLimit: 0 }, { text: "hi", mentions: 60 })).toBeNull();
  });

  it("calls it spam past the count within the window", () => {
    const now = 100_000;
    const times = [now - 9000, ...Array.from({ length: 6 }, (_, i) => now - i * 1000)];
    expect(isSpam({ spamCount: 6, spamSeconds: 8 }, times, now)).toBe(false);
    expect(isSpam({ spamCount: 5, spamSeconds: 8 }, times, now)).toBe(true);
    expect(isSpam({ spamCount: 0, spamSeconds: 8 }, times, now)).toBe(false);
  });

  it("flags AI categories at the server's strictness", () => {
    const scores = { harassment: 0.75, "hate/threatening": 0.95, sexual: 0.2 };
    expect(
      aiFlags({ aiCategories: ["harassment", "hate", "sexual"], aiStrictness: "medium" }, scores),
    ).toEqual(["harassment", "hate"]);
    expect(aiFlags({ aiCategories: ["harassment", "hate"], aiStrictness: "low" }, scores)).toEqual([
      "hate",
    ]);
  });

  it("keeps AI moderation and big word lists for Pro", () => {
    expect(checkAutomod(form(), free, DEFAULT_AUTOMOD).ok).toBe(true);
    expect(checkAutomod(form({ aiEnabled: true }), free, DEFAULT_AUTOMOD).ok).toBe(false);
    expect(checkAutomod(form({ aiEnabled: true }), pro, DEFAULT_AUTOMOD).ok).toBe(true);
    const many = Array.from({ length: 30 }, (_, i) => `word${i}`).join("\n");
    expect(checkAutomod(form({ words: many }), free, DEFAULT_AUTOMOD).ok).toBe(false);
    expect(checkAutomod(form({ words: many }), pro, DEFAULT_AUTOMOD).ok).toBe(true);
    expect(checkAutomod(form({ action: "ban" }), pro, DEFAULT_AUTOMOD).ok).toBe(false);
    expect(readAutomod({ action: "nuke", mentionLimit: 999 })).toMatchObject({
      action: "delete",
      mentionLimit: 5,
    });
  });
});
