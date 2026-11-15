import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMonths,
  billingMonth,
  nextUtcMonthStart,
  qmHoldSupplies,
  qmReserveMicros,
  quickOutputTokens,
  suppliesFor,
  utcDayStart,
} from "./ai-usage";
import type { Db } from "./client";
import { AI_SUPPLIES_PER_MONTH } from "./plans";
import {
  aiAllowance,
  aiDailyBudgetMicros,
  finishAiCall,
  type ReserveInput,
  reserveAiCall,
  suppliesUsed,
} from "./repo/ai-usage";
import { upsertGuild } from "./repo/guilds";
import { guildPlans, planBundles } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  for (const id of ["a1", "a2", "a3", "a4", "a5", "p1", "g1", "g2"])
    await upsertGuild(db, { id, name: id });
  // Plans are written by billing and staff, never the bot.
  await exec("RESET ROLE");
  // Pro on a yearly plan that renews on 10 June: its pool renews on the 10th of each month.
  await db
    .insert(guildPlans)
    .values({ guildId: "p1", plan: "pro", currentPeriodEnd: new Date("2027-06-10T00:00:00Z") });
  const [bundle] = await db
    .insert(planBundles)
    .values({ ownerId: "200", seats: 5, source: "comp" })
    .returning({ id: planBundles.id });
  for (const guildId of ["g1", "g2"])
    await db.insert(guildPlans).values({ guildId, plan: "pro", bundleId: bundle?.id });
  await exec("SET ROLE garrison_bot");
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
    const pool = AI_SUPPLIES_PER_MONTH.free;
    const holds: number[] = [];
    for (let i = 0; i < 100; i++) {
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
    // Free renews on the 1st.
    const december = nextUtcMonthStart(day);
    expect((await aiAllowance(db, "a2", "102", { now: at(24 * 18) })).suppliesLeft).toBeLessThan(4);
    expect((await aiAllowance(db, "a2", "102", { now: december })).suppliesLeft).toBe(pool);
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

  it("renews a paid pool with its billing period, a month at a time", () => {
    // Billed on the 31st: the pool renews on the last day of shorter months.
    const jan31 = new Date("2026-01-31T10:00:00Z");
    expect(addMonths(jan31, 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(billingMonth(jan31, new Date("2026-03-05T00:00:00Z"))).toEqual({
      start: new Date("2026-02-28T10:00:00Z"),
      resetsAt: new Date("2026-03-31T10:00:00Z"),
    });
    // A yearly plan ending next June renews its pool on the 10th of every month.
    expect(billingMonth(new Date("2027-06-10T00:00:00Z"), day)).toEqual({
      start: new Date("2026-11-10T00:00:00Z"),
      resetsAt: new Date("2026-12-10T00:00:00Z"),
    });
  });

  it("gives Pro its pool from its billing period, and Agency one pool its servers share", async () => {
    // Used on 9 November, the last day of the previous billing month: it doesn't count.
    const before = await reserveAiCall(db, input("p1", "107"), at(-72));
    if (!before.ok) throw new Error(before.reason);
    await finish(before.id);
    expect(await aiAllowance(db, "p1", "107", { now: at(1) })).toEqual({
      tier: "pro",
      pool: 3000,
      suppliesLeft: 3000,
      perPerson: false,
      shared: false,
      resetsAt: new Date("2026-12-10T00:00:00Z"),
    });
    const agency = await reserveAiCall(db, input("g1", "108"), at(1));
    if (!agency.ok) throw new Error(agency.reason);
    await finish(agency.id);
    expect(await aiAllowance(db, "g2", "109", { now: at(1) })).toMatchObject({
      tier: "agency",
      pool: 13_000,
      suppliesLeft: 12_997,
      shared: true,
    });
  });

  it("grows the global daily budget with each paying server", async () => {
    // $2, plus $0.30 a day for the Pro server and $1.30 for the Agency plan.
    expect(await aiDailyBudgetMicros(db, 2)).toBe(3_600_000);
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
