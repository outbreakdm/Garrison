import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  qmHoldSupplies,
  qmReserveMicros,
  quickOutputTokens,
  suppliesFor,
  utcDayStart,
} from "./ai-usage";
import type { Db } from "./client";
import { AI_SUPPLIES_PER_DAY } from "./plans";
import {
  aiAllowance,
  finishAiCall,
  type ReserveInput,
  reserveAiCall,
  suppliesUsed,
} from "./repo/ai-usage";
import { upsertGuild } from "./repo/guilds";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  for (const id of ["a1", "a2", "a3", "a4", "a5"]) await upsertGuild(db, { id, name: id });
});
afterAll(() => close());

const model = "claude-haiku-5-5";
const day = utcDayStart(new Date("2026-11-12T00:00:00Z"));
const at = (hours: number) => new Date(day.getTime() + hours * 3_600_000);
const input = (
  guildId: string,
  person: string,
  over: Partial<ReserveInput> = {},
): ReserveInput => ({
  guildId,
  feature: "qm_chat",
  requestedBy: person,
  model,
  holdSupplies: 14,
  minSupplies: 4,
  attemptsPerHour: 100,
  dailyBudgetMicros: null,
  ...over,
});
/** A typical message: 6,700 tokens in, 3,900 out, $0.0026, charged 3. */
const finish = (id: string, over: { ok?: boolean; charge?: boolean; costMicros?: number } = {}) =>
  finishAiCall(db, id, {
    model,
    inputTokens: 6700,
    outputTokens: 3900,
    costMicros: 2620,
    ok: true,
    charge: true,
    ...over,
  });

describe("AI supplies", () => {
  it("prices a supply at $0.001 and holds the most a message can cost", () => {
    // 12,000 tokens in at the cache-write rate plus 6,000 out: $0.0045 a round.
    expect(qmReserveMicros(model)).toBe(4500);
    expect(qmHoldSupplies(model, 3)).toBe(14);
    expect(qmHoldSupplies(model, 1)).toBe(5);
    expect(suppliesFor(2620)).toBe(3);
    expect(suppliesFor(0)).toBe(0);
    // Four supplies pay for one round with a shorter answer.
    expect(quickOutputTokens(model, 4)).toBe(5000);
    expect(quickOutputTokens(model, 50)).toBe(6000);
  });

  it("holds a message while it runs, then charges what it really cost", async () => {
    const r = await reserveAiCall(db, input("a1", "101"), at(1));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hold).toBe(14);
    expect(await suppliesUsed(db, { guildId: "a1" }, { now: at(1) })).toBe(14);
    expect(await finish(r.id)).toBe(3);
    expect(await suppliesUsed(db, { guildId: "a1" }, { now: at(1) })).toBe(3);
  });

  it("takes a smaller hold near the end of the pool, then stops", async () => {
    const pool = AI_SUPPLIES_PER_DAY.free;
    const holds: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await reserveAiCall(db, input("a2", "102"), at(2));
      if (!r.ok) {
        expect(r.reason).toBe("person");
        break;
      }
      holds.push(r.hold);
      await finish(r.id);
    }
    const used = await suppliesUsed(db, { guildId: "a2" }, { now: at(2) });
    // Every message charged 3 until fewer than 4 were left.
    expect(used).toBe(holds.length * 3);
    expect(pool - used).toBeLessThan(4);
    expect(holds.at(-1)).toBeLessThan(14);
    // A new day, a new pool.
    expect((await aiAllowance(db, "a2", "102", { now: at(25) })).suppliesLeft).toBe(pool);
  });

  it("charges a failed call what it used, and a refused plan nothing", async () => {
    const failed = await reserveAiCall(db, input("a3", "103"), at(3));
    if (!failed.ok) throw new Error(failed.reason);
    expect(await finish(failed.id, { ok: false, costMicros: 1200 })).toBe(2);
    const refused = await reserveAiCall(db, input("a3", "103"), at(3));
    if (!refused.ok) throw new Error(refused.reason);
    expect(await finish(refused.id, { charge: false })).toBe(0);
    expect(await suppliesUsed(db, { guildId: "a3" }, { now: at(3) })).toBe(2);
  });

  it("stops counting a crashed call's hold after 10 minutes", async () => {
    const r = await reserveAiCall(db, input("a4", "104"), at(4));
    expect(r.ok).toBe(true);
    expect(await suppliesUsed(db, { guildId: "a4" }, { now: at(4.1) })).toBe(14);
    expect(await suppliesUsed(db, { guildId: "a4" }, { now: at(4.25) })).toBe(0);
  });

  it("stops at the day's budget, counting running calls at their hold", async () => {
    // A later day: the budget is shared by every server, so earlier tests' spend would count.
    const budget = (g: string, p: string) => input(g, p, { dailyBudgetMicros: 20_000 });
    const first = await reserveAiCall(db, budget("a5", "105"), at(74));
    if (!first.ok) throw new Error("first");
    await finish(first.id); // 2,620 spent
    expect((await reserveAiCall(db, budget("a5", "105"), at(74.1))).ok).toBe(true); // + 14,000 held
    expect(await reserveAiCall(db, budget("a1", "106"), at(74.2))).toMatchObject({
      ok: false,
      reason: "budget",
    });
  });
});
