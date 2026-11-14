import type { Suggestion } from "@garrison/db";
import { nextVote } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardMessage, cardTexts } from "../../lib/card.js";
import { parseSuggestionId, suggestionCard, votingOpen } from "./service.js";

const base: Suggestion = {
  id: "00000000-0000-4000-8000-000000000001",
  guildId: "1",
  number: 12,
  authorId: "42",
  authorName: "kel",
  text: "Add a #clips channel @everyone",
  anonymous: false,
  status: "open",
  up: 3,
  down: 1,
  channelId: "2",
  messageId: "3",
  staffNote: null,
  decidedBy: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
};

describe("suggestions", () => {
  it("reads vote buttons and nothing else", () => {
    expect(parseSuggestionId(`sg:u:${base.id}`)).toEqual({ value: 1, id: base.id });
    expect(parseSuggestionId(`sg:d:${base.id}`)).toEqual({ value: -1, id: base.id });
    expect(parseSuggestionId("sg:x:nope")).toBeNull();
    expect(parseSuggestionId(`gw:e:${base.id}`)).toBeNull();
  });

  it("takes a vote back on a second press and switches on the other button", () => {
    expect(nextVote(0, 1)).toBe(1);
    expect(nextVote(1, 1)).toBe(0);
    expect(nextVote(1, -1)).toBe(-1);
    expect(nextVote(-1, -1)).toBe(0);
  });

  it("shows the idea, the author, the score and the vote buttons", () => {
    const texts = cardTexts(cardMessage(suggestionCard(base)));
    const all = texts.join("\n");
    expect(all).toContain("Suggestion #12");
    expect(all).toContain("by kel");
    expect(all).toContain("3 for, 1 against (75% for)");
    expect(all).not.toContain("@everyone");
    expect(texts).toContain("[For · 3]");
    expect(texts).toContain("[Against · 1]");
  });

  it("hides the author when anonymous and closes voting once decided", () => {
    const done = suggestionCard({
      ...base,
      anonymous: true,
      status: "done",
      staffNote: "Added this week",
    });
    const texts = cardTexts(cardMessage(done));
    const all = texts.join("\n");
    expect(all).toContain("Anonymous");
    expect(all).not.toContain("kel");
    expect(all).toContain("Staff note:** Added this week");
    expect(texts.some((t) => t.startsWith("[For"))).toBe(false);
    expect(votingOpen({ status: "planned" })).toBe(true);
    expect(votingOpen({ status: "declined" })).toBe(false);
  });
});
