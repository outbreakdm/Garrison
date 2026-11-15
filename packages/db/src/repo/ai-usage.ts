import { and, count, eq, gte, isNull, or, sql } from "drizzle-orm";
import { utcDayStart } from "../ai-usage";
import type { Db } from "../client";
import { AI_PLANS_PER_DAY, type AiTier } from "../plans";
import { aiUsage, guildPlans } from "../schema";

/**
 * One row per AI call. A call reserves its row (and a credit) before it runs and
 * records its real tokens and cost after. A failed call keeps its cost but gives
 * the credit back. A reservation left by a crash stops counting after 10 minutes.
 */

const STALE_MS = 10 * 60_000;

/** Calls that use a credit: succeeded, or still running (and not stale). */
const usesCredit = (now: Date) =>
  or(
    eq(aiUsage.ok, true),
    and(isNull(aiUsage.ok), gte(aiUsage.createdAt, new Date(now.getTime() - STALE_MS))),
  );

/** Calls on a server that is on Free right now (no Pro row), for the per-person Free limit. */
const onFreeServer = sql`not exists (select 1 from ${guildPlans} where ${guildPlans.guildId} = ${aiUsage.guildId} and ${guildPlans.plan} = 'pro')`;

export type ReserveResult =
  | { ok: true; id: string; used: number; personUsed: number | null }
  | { ok: false; reason: "credits" | "person" | "hourly" | "budget"; used: number };

export interface ReserveInput {
  guildId: string;
  feature: "qm";
  requestedBy: string;
  model: string;
  /** Credits a day for this server's plan. */
  dailyCredits: number;
  /**
   * Free only: credits a day for the person asking, across every Free server. Null for
   * Pro and Agency, which count per server.
   */
  personDailyCredits?: number | null;
  attemptsPerHour: number;
  /** For all servers together, per UTC day. Null: no cap. */
  dailyBudgetMicros: number | null;
  reserveMicros: number;
}

/**
 * Take a credit for one call, or say why not. Serialized per server (an advisory
 * lock), so two requests at once can't both take the last credit.
 */
export async function reserveAiCall(
  db: Db,
  input: ReserveInput,
  now = new Date(),
): Promise<ReserveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${input.guildId}`}))`);
    const today = utcDayStart(now);
    const mine = and(eq(aiUsage.guildId, input.guildId), eq(aiUsage.feature, input.feature));
    const [credits] = await tx
      .select({ n: count() })
      .from(aiUsage)
      .where(and(mine, gte(aiUsage.createdAt, today), usesCredit(now)));
    const used = credits?.n ?? 0;
    if (used >= input.dailyCredits) return { ok: false, reason: "credits", used };
    let personUsed: number | null = null;
    if (input.personDailyCredits != null) {
      // Second lock, always taken after the server's, so two servers can't deadlock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`ai:person:${input.requestedBy}`}))`,
      );
      const [person] = await tx
        .select({ n: count() })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.requestedBy, input.requestedBy),
            eq(aiUsage.feature, input.feature),
            gte(aiUsage.createdAt, today),
            usesCredit(now),
            onFreeServer,
          ),
        );
      personUsed = person?.n ?? 0;
      if (personUsed >= input.personDailyCredits) return { ok: false, reason: "person", used };
    }
    const [hour] = await tx
      .select({ n: count() })
      .from(aiUsage)
      .where(and(mine, gte(aiUsage.createdAt, new Date(now.getTime() - 3_600_000))));
    if ((hour?.n ?? 0) >= input.attemptsPerHour) return { ok: false, reason: "hourly", used };
    if (input.dailyBudgetMicros !== null) {
      const [spent] = await tx
        .select({
          micros: sql<number>`coalesce(sum(coalesce(${aiUsage.costMicros}, ${aiUsage.reservedMicros})), 0)::int`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, today));
      if (Number(spent?.micros ?? 0) + input.reserveMicros > input.dailyBudgetMicros)
        return { ok: false, reason: "budget", used };
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
    return {
      ok: true,
      id: row.id,
      used: used + 1,
      personUsed: personUsed === null ? null : personUsed + 1,
    };
  });
}

/** Record what a call really used. `ok: false` gives the credit back; the cost stays counted. */
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

/** Credits a server has used today, for the dashboard and /qm. */
export async function aiCreditsUsedToday(db: Db, guildId: string, feature: "qm", now = new Date()) {
  const [row] = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.guildId, guildId),
        eq(aiUsage.feature, feature),
        gte(aiUsage.createdAt, utcDayStart(now)),
        usesCredit(now),
      ),
    );
  return row?.n ?? 0;
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

/**
 * AI builder plans left today for this person on this server: the server's own allowance
 * and, on Free, the person's allowance across all their Free servers, whichever is lower.
 */
export async function aiPlansLeft(
  db: Db,
  guildId: string,
  personId: string,
  now = new Date(),
): Promise<{ tier: AiTier; daily: number; left: number; perPerson: boolean }> {
  const tier = await aiTier(db, guildId);
  const daily = AI_PLANS_PER_DAY[tier];
  const server = daily - (await aiCreditsUsedToday(db, guildId, "qm", now));
  if (tier !== "free") return { tier, daily, left: Math.max(0, server), perPerson: false };
  const [person] = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.requestedBy, personId),
        eq(aiUsage.feature, "qm"),
        gte(aiUsage.createdAt, utcDayStart(now)),
        usesCredit(now),
        onFreeServer,
      ),
    );
  const mine = daily - (person?.n ?? 0);
  return { tier, daily, left: Math.max(0, Math.min(server, mine)), perPerson: true };
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
