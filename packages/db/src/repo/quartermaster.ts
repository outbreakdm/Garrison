import { and, count, desc, eq, gte, max, ne, type SQL, sql } from "drizzle-orm";
import type { Db } from "../client";
import { guildPlans, type QmBuild, type QmCreated, type QmOperation, qmBuilds } from "../schema";

export interface CreatePlanInput {
  guildId: string;
  requestedById: string;
  requestedByTag: string;
  prompt: string;
  summary: string;
  plan: QmOperation[];
  model: string;
  notes?: string | null;
  continuesId?: string | null;
}

/** How long a plan waits to be built before it expires, as the bot enforces. */
export const QM_PLAN_TTL_MS = 15 * 60_000;

/**
 * Changes a build counts against the day: what it built (all of a built plan, what got
 * made before a failure or an undo), or what a waiting plan holds until it expires.
 * Discarded and expired plans count nothing.
 */
const changesCounted = (now: Date) => sql<number>`coalesce(sum(case
  when ${qmBuilds.status} = 'applied' then jsonb_array_length(${qmBuilds.plan})
  when ${qmBuilds.status} in ('failed', 'rolled_back') then jsonb_array_length(${qmBuilds.created})
  when ${qmBuilds.status} = 'pending' and ${qmBuilds.createdAt} > ${new Date(now.getTime() - QM_PLAN_TTL_MS).toISOString()}::timestamptz then jsonb_array_length(${qmBuilds.plan})
  else 0 end), 0)::int`;

/** Builds on a server that is on Free right now (no Pro row). */
const onFreeServer = sql`not exists (select 1 from ${guildPlans} where ${guildPlans.guildId} = ${qmBuilds.guildId} and ${guildPlans.plan} = 'pro')`;

/**
 * AI builder changes used since `since`: on one server, or (Free) by one person across
 * every Free server. `exceptId` leaves out a waiting plan that's about to be replaced.
 */
export async function qmChangesUsed(
  db: Db,
  scope: { guildId: string } | { personId: string },
  since: Date,
  opts: { exceptId?: string; now?: Date } = {},
) {
  const where: SQL[] = [gte(qmBuilds.createdAt, since)];
  if ("guildId" in scope) where.push(eq(qmBuilds.guildId, scope.guildId));
  else where.push(eq(qmBuilds.requestedById, scope.personId), onFreeServer);
  if (opts.exceptId) where.push(ne(qmBuilds.id, opts.exceptId));
  const [row] = await db
    .select({ n: changesCounted(opts.now ?? new Date()) })
    .from(qmBuilds)
    .where(and(...where));
  return Number(row?.n ?? 0);
}

/** Store a pending plan with the server's next version number. Retries once if two plans race for a number. */
export async function createQmPlan(db: Db, input: CreatePlanInput): Promise<QmBuild> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ v } = { v: 0 }] = await db
      .select({ v: max(qmBuilds.version) })
      .from(qmBuilds)
      .where(eq(qmBuilds.guildId, input.guildId));
    const [row] = await db
      .insert(qmBuilds)
      .values({ ...input, version: (v ?? 0) + 1 })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
  }
  throw new Error("Could not allocate a build version");
}

export async function getQmBuild(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), eq(qmBuilds.id, id)));
  return row ?? null;
}

export async function getQmBuildByVersion(db: Db, guildId: string, version: number) {
  const [row] = await db
    .select()
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), eq(qmBuilds.version, version)));
  return row ?? null;
}

export async function listQmBuilds(db: Db, guildId: string, limit = 20) {
  return db
    .select()
    .from(qmBuilds)
    .where(eq(qmBuilds.guildId, guildId))
    .orderBy(desc(qmBuilds.version))
    .limit(limit);
}

/** Builds started in a server since `since`, for the hourly limit. */
export async function countRecentQmBuilds(db: Db, guildId: string, since: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(qmBuilds)
    .where(and(eq(qmBuilds.guildId, guildId), gte(qmBuilds.createdAt, since)));
  return row?.n ?? 0;
}

/** Move a build between states, only from the expected one. Returns null if it wasn't in `from`. */
export async function transitionQmBuild(
  db: Db,
  id: string,
  from: QmBuild["status"],
  to: QmBuild["status"],
  extra: Partial<Pick<QmBuild, "error" | "appliedAt" | "rolledBackAt" | "rolledBackById">> = {},
) {
  const [row] = await db
    .update(qmBuilds)
    .set({ status: to, ...extra })
    .where(and(eq(qmBuilds.id, id), eq(qmBuilds.status, from)))
    .returning();
  return row ?? null;
}

/** Append one created object, as soon as it exists. */
export async function recordQmCreated(db: Db, id: string, item: QmCreated) {
  await db
    .update(qmBuilds)
    .set({ created: sql`${qmBuilds.created} || ${JSON.stringify([item])}::jsonb` })
    .where(eq(qmBuilds.id, id));
}
