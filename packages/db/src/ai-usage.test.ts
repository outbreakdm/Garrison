import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMonths,
  billingMonth,
  costMicros,
  isPricedModel,
  nextUtcMonthStart,
  outputThatFits,
  qmHoldSupplies,
  qmReserveMicros,
  roundWorstMicros,
  suppliesFor,
  utcDayStart,
} from "./ai-usage";
import type { Db } from "./client";
import { AI_SUPPLIES_PER_MONTH } from "./plans";
import {
  aiAllowance,
  aiDailyBudgetMicros,
  finishAiCall,
  packsLeft,
  type ReserveInput,
  reserveAiCall,
  settleBuildSupplies,
  suppliesUsed,
} from "./repo/ai-usage";
import { upsertGuild } from "./repo/guilds";
import { createQmPlan, transitionQmBuild } from "./repo/quartermaster";
import { aiUsage, guildPlans, planBundles, supplyGrants } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  for (const id of ["a1", "a2", "a3", "a4", "a5", "p1", "g1", "g2", "k1"])
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
    // Four supplies pay for 12,000 tokens in and a shorter answer.
    expect(outputThatFits(model, 4000, 12_000)).toBe(5000);
    expect(outputThatFits(model, 50_000, 12_000)).toBe(6000);
    // A bigger server leaves less room for the answer in the same hold.
    expect(outputThatFits(model, 4000, 30_000)).toBe(500);
  });

  it("prices each model at its own rates, and knows which it may run", () => {
    expect(roundWorstMicros(model, 12_000, 6000)).toBe(4500);
    // A refusal fallback can bill a request twice.
    expect(roundWorstMicros("claude-sonnet-5-5", 12_000, 6000, 2)).toBe(180_000);
    expect(outputThatFits("claude-sonnet-5-5", 180_000, 12_000, 2)).toBe(6000);
    // Sonnet 5.5 reads its cache at $0.10 per 1M, not a tenth of input.
    expect(costMicros("claude-sonnet-5-5", 0, 0, { read: 10_000 })).toBe(1000);
    expect(isPricedModel("claude-haiku-5-5")).toBe(true);
    expect(isPricedModel("claude-sonnet-5")).toBe(true);
    expect(isPricedModel("some-new-model")).toBe(false);
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
      pool: 2500,
      suppliesLeft: 2500,
      poolLeft: 2500,
      packLeft: 0,
      perPerson: false,
      shared: false,
      resetsAt: new Date("2026-12-10T00:00:00Z"),
    });
    const agency = await reserveAiCall(db, input("g1", "108"), at(1));
    if (!agency.ok) throw new Error(agency.reason);
    await finish(agency.id);
    expect(await aiAllowance(db, "g2", "109", { now: at(1) })).toMatchObject({
      tier: "agency",
      pool: 11_000,
      suppliesLeft: 10_997,
      shared: true,
    });
  });

  it("uses a server's packs once its pool runs out, and only for what was really spent", async () => {
    // 17 November: a day of its own, so the budget test's day doesn't see this spend.
    const now = at(120);
    await exec("RESET ROLE");
    // 198 of this month's 200 used, and a 1,000-supply pack bought.
    await db.insert(aiUsage).values({
      guildId: "k1",
      feature: "qm_chat",
      requestedBy: "110",
      model,
      reservedMicros: 0,
      costMicros: 198_000,
      supplies: 198,
      ok: true,
      createdAt: now,
    });
    await db.insert(supplyGrants).values({
      guildId: "k1",
      pack: "small",
      supplies: 1000,
      amountCents: 299,
      stripeSessionId: "cs_k1",
      createdAt: now,
      expiresAt: new Date("2099-01-01T00:00:00Z"),
    });
    // An expired pack doesn't count.
    await db.insert(supplyGrants).values({
      guildId: "k1",
      pack: "small",
      supplies: 1000,
      amountCents: 299,
      stripeSessionId: "cs_k1_old",
      createdAt: now,
      expiresAt: day,
    });
    await exec("SET ROLE garrison_bot");
    expect(await aiAllowance(db, "k1", "110", { now })).toMatchObject({
      poolLeft: 2,
      packLeft: 1000,
      suppliesLeft: 1002,
    });
    // A message runs on the pack and is charged 3: 2 from the pool, 1 from the pack.
    const r = await reserveAiCall(db, input("k1", "110"), now);
    if (!r.ok) throw new Error(r.reason);
    expect(r.hold).toBe(14);
    await finish(r.id);
    expect(await packsLeft(db, "k1")).toBe(999);
    expect(await aiAllowance(db, "k1", "110", { now })).toMatchObject({
      poolLeft: 0,
      packLeft: 999,
    });
    // A plan's changes come out of the pack once they're made, not while they wait.
    const plan = await createQmPlan(db, {
      guildId: "k1",
      requestedById: "110",
      requestedByTag: "k",
      prompt: "x",
      summary: "x",
      plan: Array.from({ length: 5 }, (_, i) => ({
        kind: "create_role" as const,
        ref: `r${i}`,
        name: `R${i}`,
        parent: null,
        topic: null,
        slowmodeSeconds: null,
        userLimit: null,
        privateTo: [],
        color: null,
        hoist: false,
        mentionable: false,
      })),
      model,
    });
    await exec("RESET ROLE");
    await exec(`UPDATE qm_builds SET created_at = '${now.toISOString()}' WHERE id = '${plan.id}'`);
    await exec("SET ROLE garrison_bot");
    expect(await packsLeft(db, "k1")).toBe(999);
    expect((await aiAllowance(db, "k1", "110", { now })).packLeft).toBe(994);
    await transitionQmBuild(db, plan.id, "pending", "applied");
    await settleBuildSupplies(db, plan.id);
    expect(await packsLeft(db, "k1")).toBe(994);
    expect(await aiAllowance(db, "k1", "110", { now })).toMatchObject({
      poolLeft: 0,
      packLeft: 994,
    });
  });

  it("grows the global daily budget with each paying server", async () => {
    // $2, plus $0.25 a day for the Pro server and $1.10 for the Agency plan, plus the 2,000
    // supplies in packs bought this week ($2.00).
    expect(await aiDailyBudgetMicros(db, 2, at(121))).toBe(5_350_000);
  });

  it("stops at the day's budget, counting running calls at their hold", async () => {
    // A later day: the budget is shared by every server, so earlier tests' spend would count.
    const budget = (g: string, p: string) => input(g, p, { dailyBudgetMicros: 20_000 });
    const first = await reserveAiCall(db, budget("a5", "105"), at(242));
    if (!first.ok) throw new Error("first");
    await finish(first.id); // 2,620 spent
    expect((await reserveAiCall(db, budget("a5", "105"), at(242.1))).ok).toBe(true); // + 14,000 held
    expect(await reserveAiCall(db, budget("a1", "106"), at(242.2))).toMatchObject({
      ok: false,
      reason: "budget",
    });
  });
});
