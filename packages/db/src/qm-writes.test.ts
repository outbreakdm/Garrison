import { describe, expect, it } from "vitest";
import { blankCard, CARD_LIMITS } from "./cards";
import { cardText, withText } from "./qm-writes";

describe("text the AI assistant writes into cards", () => {
  it("turns paragraphs into the card's text blocks, keeping its look", () => {
    const base = { ...blankCard("Old"), accent: "#ff0000" };
    const card = withText(base, "  New   title ", "First line.\nStill first.\n\n\nSecond.");
    expect(card.title).toBe("New title");
    expect(card.accent).toBe("#ff0000");
    expect(card.blocks).toEqual([
      { kind: "text", text: "First line.\nStill first." },
      { kind: "text", text: "Second." },
    ]);
  });

  it("merges paragraphs past the card's block limit into the last one", () => {
    const body = Array.from({ length: CARD_LIMITS.blocks + 2 }, (_, i) => `P${i}`).join("\n\n");
    const card = withText(blankCard(), "T", body);
    expect(card.blocks).toHaveLength(CARD_LIMITS.blocks);
    expect(card.blocks.at(-1)).toEqual({ kind: "text", text: "P5\n\nP6\n\nP7" });
  });

  it("reads a card back as a title and a body", () => {
    const card = withText(blankCard(), "Rules", "1. Be kind.\n\nMods decide.");
    expect(cardText(card)).toEqual({ title: "Rules", body: "1. Be kind.\n\nMods decide." });
  });
});
