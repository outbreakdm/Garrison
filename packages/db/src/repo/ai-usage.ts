import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import {
  billingMonth,
  nextUtcMonthStart,
  QM_MICROS_PER_SUPPLY,
  suppliesFor,
  utcDayStart,
  utcMonthStart,
} from "../ai-usage";
import type { Db } from "../client";
import { AI_SUPPLIES_PER_MONTH, type AiTier } from "../plans";

/** Kinds of AI call: a one-shot plan, or a message in the builder's chat. */
export type AiFeature = "qm" | "qm_chat";

import { aiUsage, guildPlans, planBundles } from "../schema";
import { qmChangesUsed } from "./quartermaster";

/**
 * One row per AI call. A call holds the most it could cost (`supplies`) before it runs,
 * and is charged what it really cost after: 1 supply per $0.001, rounded up. A failed call
 * is charged what it used; a reply Garrison's own checks refused is free. A hold left by a
 * crash stops counting after 10 minutes.
 *
 * Supplies come from a monthly pool (plans.ts AI_SUPPLIES_PER_MONTH): Pro per server,
 * Agency shared by its servers, Free per server and per person. Paid pools renew with the
 * billing period, Free on the 1st (UTC).
 */

const STALE_MS = 10 * 60_000;

/** Supplies a call counts: its charge, or while it runs (and isn't stale), its hold. */
const callSupplies = (now: Date) =>
  sql`case when ${aiUsage.ok} is null and ${aiUsage.createdAt} < ${new Date(
    now.getTime() - STALE_MS,
  ).toISOString()}::timestamptz then 0 else ${aiUsage.supplies} end`;

/** Calls on a server that is on Free right now (no Pro row), for the per-person Free limit. */
const onFreeServer = sql`not exists (select 1 from ${guildPlans} where ${guildPlans.guildId} = ${aiUsage.guildId} and ${guildPlans.plan} = 'pro')`;

/** Whose supplies: one server's, an Agency plan's shared pool, or (Free) one person's. */
export type PoolScope = { guildId: string } | { bundleId: string } | { personId: string };

export type LimitReason = "supplies" | "person" | "hourly" | "budget";

export type ReserveResult =
  | {
      ok: true;
      id: string;
      /** What the call holds, and may cost at most. Less than asked near the end of a pool. */
      hold: number;
      /** Left once the hold is taken. */
      suppliesLeft: number;
      allowance: AiAllowance;
    }
  | { ok: false; reason: LimitReason; allowance: AiAllowance };

export interface ReserveInput {
  guildId: string;
  feature: AiFeature;
  requestedBy: string;
  model: string;
  /** The most the call can cost, in supplies (qmHoldSupplies). */
  holdSupplies: number;
  /** The fewest it can run on: below its full hold, it runs as a shorter call. */
  minSupplies?: number;
  /** A waiting plan about to be replaced by this call's revision: its changes don't count. */
  exceptId?: string;
  attemptsPerHour: number;
  /** For all servers together, per UTC day. Null: no cap. */
  dailyBudgetMicros: number | null;
}

const lock = (key: string) => sql`select pg_advisory_xact_lock(hashtext(${key}))`;

/**
 * Hold a call's supplies, or say why not. Serialized per pool (advisory locks: the
 * server's, then its Agency plan's or its asker's), so two requests at once can't both take
 * the last supplies, and two servers can't deadlock.
 */
export async function reserveAiCall(
  db: Db,
  input: ReserveInput,
  now = new Date(),
): Promise<ReserveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(lock(`ai:${input.guildId}`));
    const info = await poolInfo(tx, input.guildId);
    if (info.bundleId) await tx.execute(lock(`ai:bundle:${info.bundleId}`));
    if (info.tier === "free") await tx.execute(lock(`ai:person:${input.requestedBy}`));
    const allowance = await allowanceFor(tx, info, input.guildId, input.requestedBy, {
      exceptId: input.exceptId,
      now,
    });
    const left = allowance.suppliesLeft;
    const min = Math.min(input.minSupplies ?? input.holdSupplies, input.holdSupplies);
    if (left < min)
      return { ok: false, reason: allowance.perPerson ? "person" : "supplies", allowance };
    const hold = Math.min(input.holdSupplies, left);
    const [hour] = await tx
      .select({ n: count() })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.guildId, input.guildId),
          eq(aiUsage.feature, input.feature),
          gte(aiUsage.createdAt, new Date(now.getTime() - 3_600_000)),
        ),
      );
    if ((hour?.n ?? 0) >= input.attemptsPerHour) return { ok: false, reason: "hourly", allowance };
    const reservedMicros = hold * QM_MICROS_PER_SUPPLY;
    if (input.dailyBudgetMicros !== null) {
      const [spent] = await tx
        .select({
          micros: sql<number>`coalesce(sum(coalesce(${aiUsage.costMicros}, ${aiUsage.reservedMicros})), 0)::int`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, utcDayStart(now)));
      if (Number(spent?.micros ?? 0) + reservedMicros > input.dailyBudgetMicros)
        return { ok: false, reason: "budget", allowance };
    }
    const [row] = await tx
      .insert(aiUsage)
      .values({
        guildId: input.guildId,
        feature: input.feature,
        requestedBy: input.requestedBy,
        bundleId: info.bundleId,
        model: input.model,
        reservedMicros,
        supplies: hold,
        createdAt: now,
      })
      .returning({ id: aiUsage.id });
    if (!row) throw new Error("Couldn't record the AI call");
    return { ok: true, id: row.id, hold, suppliesLeft: left - hold, allowance };
  });
}

export interface AiCallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costMicros: number;
}

const usageColumns = (u: AiCallUsage) => ({
  model: u.model,
  inputTokens: u.inputTokens,
  outputTokens: u.outputTokens,
  cacheReadTokens: u.cacheReadTokens ?? 0,
  cacheWriteTokens: u.cacheWriteTokens ?? 0,
  costMicros: u.costMicros,
});

/**
 * Charge a running call what it has cost so far, before it finishes, so the supplies a plan
 * is checked against don't still include the call's whole hold.
 */
export async function meterAiCall(db: Db, id: string, usage: AiCallUsage) {
  await db
    .update(aiUsage)
    .set({ ...usageColumns(usage), supplies: suppliesFor(usage.costMicros) })
    .where(eq(aiUsage.id, id));
}

/**
 * Record what a call really used, and charge it. `charge: false` is for a reply Garrison's
 * own checks refused: the cost stays counted against the budget, the admin pays nothing.
 */
export async function finishAiCall(
  db: Db,
  id: string,
  result: AiCallUsage & { ok: boolean; charge: boolean },
) {
  const supplies = result.charge ? suppliesFor(result.costMicros) : 0;
  await db
    .update(aiUsage)
    .set({ ...usageColumns(result), ok: result.ok, supplies })
    .where(eq(aiUsage.id, id));
  return supplies;
}

/** Supplies AI calls used in a pool since `since`. */
async function callSuppliesSince(db: Db, scope: PoolScope, since: Date, now: Date) {
  const who =
    "guildId" in scope
      ? eq(aiUsage.guildId, scope.guildId)
      : "bundleId" in scope
        ? eq(aiUsage.bundleId, scope.bundleId)
        : and(eq(aiUsage.requestedBy, scope.personId), onFreeServer);
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${callSupplies(now)}), 0)::int` })
    .from(aiUsage)
    .where(and(who, gte(aiUsage.createdAt, since)));
  return Number(row?.n ?? 0);
}

/**
 * Supplies a pool used since `since`: what AI calls were charged (or hold while running),
 * and 1 for each change plans made or hold. An Agency pool counts calls made under it and
 * changes on the servers in its seats.
 */
export async function suppliesUsed(
  db: Db,
  scope: PoolScope,
  opts: { exceptId?: string; now?: Date; since?: Date } = {},
) {
  const now = opts.now ?? new Date();
  // The calendar month unless a pool's own period is given.
  const since = opts.since ?? utcMonthStart(now);
  const [calls, changes] = await Promise.all([
    callSuppliesSince(db, scope, since, now),
    qmChangesUsed(db, scope, since, { ...opts, now }),
  ]);
  return calls + changes;
}

/** What a server's AI use counts under: its tier, its Agency plan, and its billing period. */
export interface PoolInfo {
  tier: AiTier;
  /** The Agency plan whose seat the server takes. */
  bundleId: string | null;
  /** A date the paid pool renews on (the billing period's end). Null: renews on the 1st. */
  anchor: Date | null;
}

export async function poolInfo(db: Db, guildId: string): Promise<PoolInfo> {
  const [row] = await db
    .select({
      plan: guildPlans.plan,
      bundleId: guildPlans.bundleId,
      ownEnd: guildPlans.currentPeriodEnd,
      bundleEnd: planBundles.currentPeriodEnd,
    })
    .from(guildPlans)
    .leftJoin(planBundles, eq(planBundles.id, guildPlans.bundleId))
    .where(eq(guildPlans.guildId, guildId));
  if (row?.plan !== "pro") return { tier: "free", bundleId: null, anchor: null };
  if (row.bundleId) return { tier: "agency", bundleId: row.bundleId, anchor: row.bundleEnd };
  return { tier: "pro", bundleId: null, anchor: row.ownEnd };
}

/**
 * The pool's current month: from the billing period for a paid plan (a month at a time on
 * yearly plans), so subscribing late in a month doesn't get two pools in two days, and the
 * calendar month for Free and for plans Garrison staff gave.
 */
export function poolPeriod(info: Pick<PoolInfo, "tier" | "anchor">, now = new Date()) {
  if (info.tier === "free" || !info.anchor)
    return { start: utcMonthStart(now), resetsAt: nextUtcMonthStart(now) };
  return billingMonth(info.anchor, now);
}

/** Free, Pro, or Agency (Pro from an Agency seat): what this server's AI use counts under. */
export async function aiTier(db: Db, guildId: string): Promise<AiTier> {
  return (await poolInfo(db, guildId)).tier;
}

export interface AiAllowance {
  tier: AiTier;
  /** Supplies in this tier's monthly pool, and how many this person can still use here. */
  pool: number;
  suppliesLeft: number;
  /** Free: counted per person across all their Free servers, as well as per server. */
  perPerson: boolean;
  /** Agency: one pool shared by the plan's servers. */
  shared: boolean;
  /** When the pool renews. */
  resetsAt: Date;
}

async function allowanceFor(
  db: Db,
  info: PoolInfo,
  guildId: string,
  personId: string,
  opts: { exceptId?: string; now?: Date },
): Promise<AiAllowance> {
  const now = opts.now ?? new Date();
  const period = poolPeriod(info, now);
  const pool = AI_SUPPLIES_PER_MONTH[info.tier];
  const perPerson = info.tier === "free";
  const used = { ...opts, now, since: period.start };
  const [server, person] = await Promise.all([
    suppliesUsed(db, info.bundleId ? { bundleId: info.bundleId } : { guildId }, used),
    perPerson ? suppliesUsed(db, { personId }, used) : 0,
  ]);
  return {
    tier: info.tier,
    pool,
    suppliesLeft: Math.max(0, pool - Math.max(server, person)),
    perPerson,
    shared: Boolean(info.bundleId),
    resetsAt: period.resetsAt,
  };
}

/**
 * What this person can still spend on the AI assistant on this server: the lower of the
 * pool's supplies and (on Free) the person's. `exceptId` leaves out a waiting plan that's
 * about to be replaced by a revision.
 */
export async function aiAllowance(
  db: Db,
  guildId: string,
  personId: string,
  opts: { exceptId?: string; now?: Date } = {},
): Promise<AiAllowance> {
  return allowanceFor(db, await poolInfo(db, guildId), guildId, personId, opts);
}

/**
 * The global daily budget: a circuit breaker for a runaway, never an allowance. `baseUsd`
 * plus three times each paid pool's average day (Pro: 3 × $3.00 / 30 = $0.30), so normal
 * use on every paying server at once can't trip it.
 */
export async function aiDailyBudgetMicros(db: Db, baseUsd: number) {
  const [[pro], [agency]] = await Promise.all([
    db
      .select({ n: count() })
      .from(guildPlans)
      .where(and(eq(guildPlans.plan, "pro"), isNull(guildPlans.bundleId))),
    db.select({ n: count() }).from(planBundles),
  ]);
  const day = (pool: number) => (3 * pool * QM_MICROS_PER_SUPPLY) / 30;
  return Math.round(
    baseUsd * 1e6 +
      (pro?.n ?? 0) * day(AI_SUPPLIES_PER_MONTH.pro) +
      (agency?.n ?? 0) * day(AI_SUPPLIES_PER_MONTH.agency),
  );
}

/** Spend across all servers since `since`, in dollars, for the operator. */
export async function aiSpendSince(db: Db, since: Date) {
  const [row] = await db
    .select({
      micros: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)::bigint`,
      calls: count(),
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since));
  return { dollars: Number(row?.micros ?? 0) / 1e6, calls: row?.calls ?? 0 };
}
