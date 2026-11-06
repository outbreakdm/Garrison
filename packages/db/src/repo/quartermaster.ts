import { and, count, desc, eq, gte, max, sql } from "drizzle-orm";
import type { Db } from "../client";
import { type QmBuild, type QmCreated, type QmOperation, qmBuilds } from "../schema";

export interface CreatePlanInput {
  guildId: string;
  requestedById: string;
  requestedByTag: string;
  prompt: string;
  summary: string;
  plan: QmOperation[];
  model: string;
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
