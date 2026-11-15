import { and, count, eq, gte, isNull, or, sql } from "drizzle-orm";
import { utcDayStart } from "../ai-usage";
import type { Db } from "../client";
import { AI_SUPPLIES_PER_DAY, AI_SUPPLIES_PER_MESSAGE, type AiTier } from "../plans";

/** Kinds of AI call: a one-shot plan, or a message in the builder's chat. */
export type AiFeature = "qm" | "qm_chat";

import { aiUsage, guildPlans } from "../schema";
import { qmChangesUsed } from "./quartermaster";

/**
 * One row per AI call. A call reserves its row (and its supplies) before it runs and
 * records its real tokens and cost after. A failed call keeps its cost but gives the
 * supplies back. A reservation left by a crash stops counting after 10 minutes.
 */

const STALE_MS = 10 * 60_000;

/** Calls that use supplies: succeeded, or still running (and not stale). */
const usesCredit = (now: Date) =>
  or(
    eq(aiUsage.ok, true),
    and(isNull(aiUsage.ok), gte(aiUsage.createdAt, new Date(now.getTime() - STALE_MS))),
  );

/** Calls on a server that is on Free right now (no Pro row), for the per-person Free limit. */
const onFreeServer = sql`not exists (select 1 from ${guildPlans} where ${guildPlans.guildId} = ${aiUsage.guildId} and ${guildPlans.plan} = 'pro')`;

export type ReserveResult =
  | { ok: true; id: string; suppliesLeft: number }
  | { ok: false; reason: "supplies" | "person" | "hourly" | "budget" };

export interface ReserveInput {
  guildId: string;
  feature: AiFeature;
  requestedBy: string;
  model: string;
  /** Supplies a day for this server's plan. */
  dailySupplies: number;
  /**
   * Free only: supplies a day for the person asking, across every Free server. Null for
   * Pro and Agency, which count per server.
   */
  personDailySupplies?: number | null;
  /** A waiting plan about to be replaced by this call's revision: its changes don't count. */
  exceptId?: string;
  attemptsPerHour: number;
  /** For all servers together, per UTC day. Null: no cap. */
  dailyBudgetMicros: number | null;
  reserveMicros: number;
}

/**
 * Take a message's supplies for one call, or say why not. Serialized per server (an
 * advisory lock), so two requests at once can't both take the last supplies.
 */
export async function reserveAiCall(
  db: Db,
  input: ReserveInput,
  now = new Date(),
): Promise<ReserveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${input.guildId}`}))`);
    const today = utcDayStart(now);
    const opts = { exceptId: input.exceptId, now };
    const serverUsed = await suppliesUsed(tx, { guildId: input.guildId }, opts);
    let left = input.dailySupplies - serverUsed;
    if (left < AI_SUPPLIES_PER_MESSAGE) return { ok: false, reason: "supplies" };
    if (input.personDailySupplies != null) {
      // Second lock, always taken after the server's, so two servers can't deadlock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`ai:person:${input.requestedBy}`}))`,
      );
      const personUsed = await suppliesUsed(tx, { personId: input.requestedBy }, opts);
      const personLeft = input.personDailySupplies - personUsed;
      if (personLeft < AI_SUPPLIES_PER_MESSAGE) return { ok: false, reason: "person" };
      left = Math.min(left, personLeft);
    }
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
    if ((hour?.n ?? 0) >= input.attemptsPerHour) return { ok: false, reason: "hourly" };
    if (input.dailyBudgetMicros !== null) {
      const [spent] = await tx
        .select({
          micros: sql<number>`coalesce(sum(coalesce(${aiUsage.costMicros}, ${aiUsage.reservedMicros})), 0)::int`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, today));
      if (Number(spent?.micros ?? 0) + input.reserveMicros > input.dailyBudgetMicros)
        return { ok: false, reason: "budget" };
    }
    const [row] = await tx
      .insert(aiUsage)
      .values({
        guildId: input.guildId,
        feature: input.feature,
        requestedBy: input.requestedBy,
        model: input.model,
        reservedMicros: input.reserveMicros,
        createdAt: now,
      })
      .returning({ id: aiUsage.id });
    if (!row) throw new Error("Couldn't record the AI call");
    return { ok: true, id: row.id, suppliesLeft: left - AI_SUPPLIES_PER_MESSAGE };
  });
}

/** Record what a call really used. `ok: false` gives its supplies back; the cost stays counted. */
export async function finishAiCall(
  db: Db,
  id: string,
  result: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    ok: boolean;
  },
) {
  await db
    .update(aiUsage)
    .set({
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costMicros: result.costMicros,
      ok: result.ok,
    })
    .where(eq(aiUsage.id, id));
}

/** AI calls that use supplies today (all kinds): on one server, or (Free) by one person on Free servers. */
export async function aiCallsToday(
  db: Db,
  scope: { guildId: string } | { personId: string },
  now = new Date(),
) {
  const who =
    "guildId" in scope
      ? eq(aiUsage.guildId, scope.guildId)
      : and(eq(aiUsage.requestedBy, scope.personId), onFreeServer);
  const [row] = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(and(who, gte(aiUsage.createdAt, utcDayStart(now)), usesCredit(now)));
  return row?.n ?? 0;
}

/**
 * Supplies used today: 3 for each AI call (running or succeeded) and 1 for each change
 * plans made or hold. On one server, or (Free) by one person across every Free server.
 */
export async function suppliesUsed(
  db: Db,
  scope: { guildId: string } | { personId: string },
  opts: { exceptId?: string; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const [calls, changes] = await Promise.all([
    aiCallsToday(db, scope, now),
    qmChangesUsed(db, scope, utcDayStart(now), { ...opts, now }),
  ]);
  return calls * AI_SUPPLIES_PER_MESSAGE + changes;
}

/** Free, Pro, or Agency (Pro from an Agency seat): what this server's AI use counts under. */
export async function aiTier(db: Db, guildId: string): Promise<AiTier> {
  const [row] = await db
    .select({ plan: guildPlans.plan, bundleId: guildPlans.bundleId })
    .from(guildPlans)
    .where(eq(guildPlans.guildId, guildId));
  if (row?.plan !== "pro") return "free";
  return row.bundleId ? "agency" : "pro";
}

export interface AiAllowance {
  tier: AiTier;
  /** Supplies a day for this tier, and how many this person can still use here today. */
  suppliesPerDay: number;
  suppliesLeft: number;
  /** Free: counted per person across all their Free servers, as well as per server. */
  perPerson: boolean;
}

/**
 * What this person can still spend on the AI assistant on this server today: the lower of
 * the server's supplies and (on Free) the person's. `exceptId` leaves out a waiting plan
 * that's about to be replaced by a revision.
 */
export async function aiAllowance(
  db: Db,
  guildId: string,
  personId: string,
  opts: { exceptId?: string; now?: Date } = {},
): Promise<AiAllowance> {
  const tier = await aiTier(db, guildId);
  const suppliesPerDay = AI_SUPPLIES_PER_DAY[tier];
  const perPerson = tier === "free";
  const [server, person] = await Promise.all([
    suppliesUsed(db, { guildId }, opts),
    perPerson ? suppliesUsed(db, { personId }, opts) : 0,
  ]);
  return {
    tier,
    suppliesPerDay,
    suppliesLeft: Math.max(0, suppliesPerDay - Math.max(server, person)),
    perPerson,
  };
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
