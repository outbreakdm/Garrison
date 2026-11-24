import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  createSuggestion,
  getSuggestionSettings,
  setSuggestionPanelMessage,
} from "./repo/suggestions";
import { suggestionSettings } from "./schema";
import {
  checkSuggestionAnswers,
  checkSuggestionPanel,
  DEFAULT_SUGGESTION_QUESTIONS,
  readSuggestions,
  SUGGESTION_LIMITS,
  SUGGESTION_PANEL,
  suggestionPanel,
  suggestionQuestions,
} from "./suggestions";
import { createTestDb } from "./testing";

const q = (id: string, label: string, long = false) => ({ id, label, help: null, long });

describe("the suggestions panel and its form", () => {
  it("uses the standard words and form until a server writes its own", () => {
    const c = readSuggestions(null);
    expect(suggestionPanel(c)).toEqual({
      title: SUGGESTION_PANEL.title,
      body: SUGGESTION_PANEL.body,
      button: SUGGESTION_PANEL.button,
    });
    expect(suggestionQuestions(c)).toEqual(DEFAULT_SUGGESTION_QUESTIONS);
    expect(c.panelSticky).toBe(true);
  });

  it("stores the standard text and form as null, and checks lengths", () => {
    expect(
      checkSuggestionPanel({
        panelTitle: SUGGESTION_PANEL.title,
        panelBody: "  Tell us\r\nanything ",
        buttonLabel: "",
        questions: DEFAULT_SUGGESTION_QUESTIONS,
        panelSticky: false,
      }),
    ).toEqual({
      ok: true,
      value: {
        panelTitle: null,
        panelBody: "Tell us\nanything",
        buttonLabel: null,
        questions: [],
        panelSticky: false,
      },
    });
    expect(
      checkSuggestionPanel({ panelTitle: "x".repeat(SUGGESTION_LIMITS.panelTitle + 1) }).ok,
    ).toBe(false);
    expect(checkSuggestionPanel({ buttonLabel: "Two\nlines" }).ok).toBe(false);
  });

  it("holds Discord's five questions, each with its question and a stable id", () => {
    const five = ["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee"].map((id) => q(id, "Q"));
    expect(checkSuggestionPanel({ questions: five }).ok).toBe(true);
    expect(checkSuggestionPanel({ questions: [...five, q("ffffff", "Q")] }).ok).toBe(false);
    expect(checkSuggestionPanel({ questions: [q("aaaaaa", " ")] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/needs its question/),
    });
    expect(checkSuggestionPanel({ questions: [q("aaaaaa", "A"), q("aaaaaa", "B")] }).ok).toBe(
      false,
    );
  });

  it("needs the idea, and keeps the other answers only when they're given", () => {
    const form = [q("idea01", "Your idea"), q("why001", "Why", true), q("who001", "Who for")];
    expect(checkSuggestionAnswers(form, { idea01: " ", why001: "Because" })).toMatchObject({
      ok: false,
      error: "Answer “Your idea”.",
    });
    expect(
      checkSuggestionAnswers(form, { idea01: " A clips channel ", who001: "Streamers" }),
    ).toEqual({
      ok: true,
      value: {
        text: "A clips channel",
        answers: [
          { label: "Your idea", value: "A clips channel" },
          { label: "Who for", value: "Streamers" },
        ],
      },
    });
    // A line holds 200 characters; a paragraph the suggestion's 1000.
    expect(checkSuggestionAnswers(form, { idea01: "x".repeat(201) }).ok).toBe(false);
    expect(checkSuggestionAnswers(form, { idea01: "Idea", why001: "x".repeat(1000) }).ok).toBe(
      true,
    );
  });
});

describe("suggestions panel storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "975000000000000001";
  const CH = "975000000000000002";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("lets the dashboard save the panel and form, and the bot record where it's posted", async () => {
    await exec("SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "suggestions",
      patch: {
        enabled: true,
        channelId: CH,
        panelTitle: "Ideas box",
        questions: [q("idea01", "Your idea")],
        panelSticky: false,
      },
      userId: "1",
      username: "taner",
    });
    expect(r.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    await setSuggestionPanelMessage(db, G, { channelId: CH, messageId: "975000000000000003" });
    expect(await getSuggestionSettings(db, G)).toMatchObject({
      panelTitle: "Ideas box",
      questions: [q("idea01", "Your idea")],
      panelSticky: false,
      panelChannelId: CH,
      panelMessageId: "975000000000000003",
    });
    // A suggestion from the form keeps every answer.
    const s = await createSuggestion(db, {
      guildId: G,
      authorId: "2",
      authorName: "kel",
      text: "A clips channel",
      answers: [{ label: "Your idea", value: "A clips channel" }],
      anonymous: false,
    });
    expect(s.answers).toEqual([{ label: "Your idea", value: "A clips channel" }]);
    // The form's questions are the dashboard's: the bot (and so the AI assistant) can't write them.
    const err = await Promise.resolve(db.update(suggestionSettings).set({ questions: [] })).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});
