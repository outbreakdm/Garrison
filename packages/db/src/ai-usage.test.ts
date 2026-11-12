import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextUtcDayStart, utcDayStart } from "./ai-usage";
import type { Db } from "./client";
import {
  aiCreditsUsedToday,
  finishAiCall,
  type ReserveInput,
  reserveAiCall,
} from "./repo/ai-usage";
import { upsertGuild } from "./repo/guilds";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  for (const id of ["a1", "a2", "a3", "a4"]) await upsertGuild(db, { id, name: id });
});
afterAll(() => close());

const day = utcDayStart(new Date("2026-11-12T00:00:00Z"));
const at = (hours: number) => new Date(day.getTime() + hours * 3_600_000);
const input = (guildId: string, over: Partial<ReserveInput> = {}): ReserveInput => ({
  guildId,
  feature: "qm",
  requestedBy: "1",
  model: "claude-haiku-5-5",
  dailyCredits: 15,
  attemptsPerHour: 10,
  dailyBudgetMicros: null,
  reserveMicros: 2600,
  ...over,
});
const finish = (id: string, ok: boolean) =>
  finishAiCall(db, id, {
    model: "claude-haiku-5-5",
    inputTokens: 3400,
    outputTokens: 2000,
    costMicros: 1340,
    ok,
  });

describe("AI credits", () => {
  it("allows 15 a day on Pro across hours, then resets at midnight UTC", async () => {
    for (let i = 0; i < 15; i++) {
      const r = await reserveAiCall(db, input("a1"), at(1 + Math.floor(i / 8) * 2));
      if (!r.ok) throw new Error(`stopped at ${i}: ${r.reason}`);
      await finish(r.id, true);
    }
    expect(await reserveAiCall(db, input("a1"), at(9))).toMatchObject({
      ok: false,
      reason: "credits",
      used: 15,
    });
    expect(await aiCreditsUsedToday(db, "a1", "qm", at(9))).toBe(15);
    expect(await reserveAiCall(db, input("a1"), at(25))).toMatchObject({ ok: true, used: 1 });
    expect(nextUtcDayStart(at(9)).toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });

  it("counts a running call, but not a crashed one after 10 minutes", async () => {
    const r = await reserveAiCall(db, input("a2", { dailyCredits: 1 }), at(1));
    expect(r.ok).toBe(true);
    expect(await reserveAiCall(db, input("a2", { dailyCredits: 1 }), at(1.05))).toMatchObject({
      ok: false,
      reason: "credits",
    });
    expect((await reserveAiCall(db, input("a2", { dailyCredits: 1 }), at(1.25))).ok).toBe(true);
  });

  it("stops at the day's budget, counting running calls at their reservation", async () => {
    // A later day: the budget is shared by every server, so earlier tests' spend would count.
    const budget = input("a3", { dailyBudgetMicros: 6000 });
    const first = await reserveAiCall(db, budget, at(74));
    if (!first.ok) throw new Error("first");
    await finish(first.id, true); // 1,340 spent
    expect((await reserveAiCall(db, budget, at(74.1))).ok).toBe(true); // + 2,600 held = 3,940
    expect(
      await reserveAiCall(db, input("a4", { dailyBudgetMicros: 6000 }), at(74.2)),
    ).toMatchObject({
      ok: false,
      reason: "budget",
    });
  });
});
