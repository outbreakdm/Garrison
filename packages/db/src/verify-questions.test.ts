import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  decideVerifyAnswers,
  listVerifyAnswers,
  pruneVerifyAnswers,
  recordVerifyAnswers,
  waitingVerifyAnswers,
} from "./repo/verify";
import { createTestDb } from "./testing";
import {
  checkVerifyAnswers,
  checkVerifyQuestions,
  questionRoom,
  readVerifyQuestions,
  VERIFY_LIMITS,
} from "./verify-questions";

const CH = "320000000000000001";
const q = (label: string, extra: Record<string, unknown> = {}) => ({ label, ...extra });

describe("verification questions", () => {
  it("fits Discord's form: five questions, or the intro and four", () => {
    expect(questionRoom(null)).toBe(5);
    expect(questionRoom("Hi")).toBe(4);
    const five = ["A", "B", "C", "D", "E"].map((l) => q(l));
    expect(
      checkVerifyQuestions({ verifyQuestions: five, verifyAnswersChannelId: CH }),
    ).toMatchObject({ ok: true });
    expect(
      checkVerifyQuestions({
        verifyQuestions: five,
        verifyIntro: "Hi",
        verifyAnswersChannelId: CH,
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/intro and four/) });
  });

  it("needs a question, a staff channel, and labels Discord can show", () => {
    expect(checkVerifyQuestions({ verifyQuestions: [q("Name?")] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/staff channel/),
    });
    expect(checkVerifyQuestions({ verifyQuestions: [q("")], verifyAnswersChannelId: CH }).ok).toBe(
      false,
    );
    expect(
      checkVerifyQuestions({
        verifyQuestions: [q("x".repeat(VERIFY_LIMITS.label + 1))],
        verifyAnswersChannelId: CH,
      }).ok,
    ).toBe(false);
    expect(checkVerifyQuestions({ verifyQuestions: [], verifyReview: true }).ok).toBe(false);
    // No questions, nothing to set up: that's how they're turned off.
    expect(checkVerifyQuestions({ verifyQuestions: [] })).toMatchObject({
      ok: true,
      value: { verifyQuestions: [], verifyAnswersChannelId: null },
    });
  });

  it("keeps an id it's given and makes one for a new question", () => {
    const r = checkVerifyQuestions({
      verifyQuestions: [q("Name?", { id: "abcdef12", help: " In game ", long: true }), q("Age?")],
      verifyAnswersChannelId: CH,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.verifyQuestions[0]).toEqual({
      id: "abcdef12",
      label: "Name?",
      help: "In game",
      long: true,
    });
    expect(r.value.verifyQuestions[1]?.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("checks answers: every question, within its box, in order", () => {
    const qs = readVerifyQuestions([
      { id: "aaaaaa11", label: "Name?" },
      { id: "bbbbbb22", label: "Why?", long: true },
    ]);
    expect(checkVerifyAnswers(qs, { aaaaaa11: "Kestrel" })).toMatchObject({
      ok: false,
      error: "Answer “Why?”.",
    });
    expect(
      checkVerifyAnswers(qs, { aaaaaa11: "x".repeat(VERIFY_LIMITS.short + 1), bbbbbb22: "ok" }).ok,
    ).toBe(false);
    expect(checkVerifyAnswers(qs, { aaaaaa11: " Kestrel ", bbbbbb22: "Raids" })).toEqual({
      ok: true,
      value: [
        { label: "Name?", value: "Kestrel" },
        { label: "Why?", value: "Raids" },
      ],
    });
  });

  it("reads stored lists leniently", () => {
    expect(
      readVerifyQuestions([
        { id: "aaaaaa11", label: "Name?" },
        { id: "aaaaaa11", label: "Again" },
        { id: "x", label: "Bad id" },
        { id: "cccccc33", label: "" },
        "junk",
      ]),
    ).toEqual([{ id: "aaaaaa11", label: "Name?", help: null, long: false }]);
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000068";
const owner = { userId: "100000000000000001", username: "owner" };
const member = { userId: "700000000000000009", username: "kestrel" };

describe("verification answers, in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Ironhold" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("the dashboard saves the questions with history", async () => {
    await exec("SET ROLE garrison_web");
    const checked = checkVerifyQuestions({
      verifyQuestions: [q("Name?")],
      verifyAnswersChannelId: CH,
      verifyReview: true,
    });
    if (!checked.ok) throw new Error(checked.error);
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "gatehouse",
        patch: { ...checked.value },
        ...owner,
      }),
    ).toMatchObject({ ok: true });
    await exec("RESET ROLE");
  });

  it("the bot records answers and only one decision lands", async () => {
    await exec("SET ROLE garrison_bot");
    const row = await recordVerifyAnswers(db, {
      guildId: G,
      ...member,
      answers: [{ label: "Name?", value: "Kestrel" }],
      status: "waiting",
    });
    expect(await waitingVerifyAnswers(db, G, member.userId)).toMatchObject({ id: row.id });
    expect(
      await decideVerifyAnswers(db, G, row.id, { status: "approved", decidedBy: "mod" }),
    ).toMatchObject({ status: "approved", decidedBy: "mod" });
    expect(
      await decideVerifyAnswers(db, G, row.id, { status: "denied", decidedBy: "other" }),
    ).toBeNull();
    expect(await waitingVerifyAnswers(db, G, member.userId)).toBeNull();
    await exec("RESET ROLE");
  });

  it("the dashboard reads answers but can't write or decide them", async () => {
    await exec("SET ROLE garrison_web");
    expect(await listVerifyAnswers(db, G)).toHaveLength(1);
    await expect(
      recordVerifyAnswers(db, { guildId: G, ...member, answers: [], status: "verified" }),
    ).rejects.toThrow();
    const [row] = await listVerifyAnswers(db, G);
    await expect(
      decideVerifyAnswers(db, G, row?.id ?? "", { status: "denied", decidedBy: "x" }),
    ).rejects.toThrow();
    await exec("RESET ROLE");
  });

  it("answers older than 30 days are deleted", async () => {
    await exec("SET ROLE garrison_bot");
    await pruneVerifyAnswers(db, new Date(Date.now() + 1000));
    expect(await listVerifyAnswers(db, G)).toEqual([]);
    await exec("RESET ROLE");
  });
});
