import type { Suggestion } from "@garrison/db";
import { DEFAULT_SUGGESTIONS, nextVote } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardMessage, cardTexts } from "../../lib/card.js";
import {
  parseSuggestionId,
  suggestionCard,
  suggestionModal,
  suggestionPanelMessage,
  votingOpen,
} from "./service.js";

const base: Suggestion = {
  id: "00000000-0000-4000-8000-000000000001",
  guildId: "1",
  number: 12,
  authorId: "42",
  authorName: "kel",
  text: "Add a #clips channel @everyone",
  answers: null,
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
    expect(all).toContain(`by <@${base.authorId}>`);
    // The idea is set off as a quote.
    expect(all).toContain(`> `);
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

  it("shows the form's other answers under their questions", () => {
    const texts = cardTexts(
      cardMessage(
        suggestionCard({
          ...base,
          text: "A clips channel",
          answers: [
            { label: "Your idea", value: "A clips channel" },
            { label: "Why it would help", value: "Highlights get lost in #general" },
          ],
        }),
      ),
    ).join("\n");
    expect(texts).toContain("A clips channel");
    expect(texts).toContain("**Why it would help**\nHighlights get lost in #general");
    // The idea shows once, as the card's text, not again under its question.
    expect(texts).not.toContain("**Your idea**");
  });
});

describe("the suggestions panel", () => {
  it("posts the server's words with the button that opens the form", () => {
    const texts = cardTexts(suggestionPanelMessage(DEFAULT_SUGGESTIONS)).join("\n");
    expect(texts).toContain("Got an idea?");
    expect(texts).toContain("[Suggest an idea]");
    const own = cardTexts(
      suggestionPanelMessage({
        ...DEFAULT_SUGGESTIONS,
        panelTitle: "Ideas box",
        buttonLabel: "Pitch it",
      }),
    ).join("\n");
    expect(own).toContain("Ideas box");
    expect(own).toContain("[Pitch it]");
  });

  it("opens a form whose first question is required and the rest optional", () => {
    const form = suggestionModal(DEFAULT_SUGGESTIONS).toJSON();
    const inputs = form.components.map(
      (c) => (c as { component: { custom_id: string; required?: boolean } }).component,
    );
    expect(inputs.map((i) => [i.custom_id, i.required])).toEqual([
      ["theidea", true],
      ["whyhelp", false],
    ]);
    expect(form.title).toBe("Suggest an idea");
  });
});
