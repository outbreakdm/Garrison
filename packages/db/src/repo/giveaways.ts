import { and, count, desc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "../client";
import { type Giveaway, giveawayEntries, giveaways } from "../schema";

export type NewGiveaway = Omit<
  typeof giveaways.$inferInsert,
  "id" | "status" | "winnerIds" | "shownEntries" | "createdAt" | "endedAt" | "messageId"
>;

export async function createGiveaway(db: Db, g: NewGiveaway): Promise<Giveaway> {
  const [row] = await db.insert(giveaways).values(g).returning();
  if (!row) throw new Error("Giveaway not created");
  return row;
}

export async function setGiveawayMessage(db: Db, id: string, messageId: string) {
  await db.update(giveaways).set({ messageId }).where(eq(giveaways.id, id));
}

export async function getGiveaway(db: Db, guildId: string, id: string): Promise<Giveaway | null> {
  const [row] = await db
    .select()
    .from(giveaways)
    .where(and(eq(giveaways.guildId, guildId), eq(giveaways.id, id)));
  return row ?? null;
}

export async function listGiveaways(db: Db, guildId: string, limit = 30): Promise<Giveaway[]> {
  return db
    .select()
    .from(giveaways)
    .where(eq(giveaways.guildId, guildId))
    .orderBy(desc(giveaways.createdAt))
    .limit(limit);
}

export async function countRunningGiveaways(db: Db, guildId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(giveaways)
    .where(and(eq(giveaways.guildId, guildId), eq(giveaways.status, "running")));
  return row?.n ?? 0;
}

/** Enter a member. False when they were already in. */
export async function enterGiveaway(db: Db, giveawayId: string, userId: string, weight: number) {
  const rows = await db
    .insert(giveawayEntries)
    .values({ giveawayId, userId, weight })
    .onConflictDoNothing()
    .returning({ userId: giveawayEntries.userId });
  return rows.length > 0;
}

export async function leaveGiveaway(db: Db, giveawayId: string, userId: string) {
  await db
    .delete(giveawayEntries)
    .where(and(eq(giveawayEntries.giveawayId, giveawayId), eq(giveawayEntries.userId, userId)));
}

export async function listGiveawayEntries(db: Db, giveawayId: string) {
  return db
    .select({ userId: giveawayEntries.userId, weight: giveawayEntries.weight })
    .from(giveawayEntries)
    .where(eq(giveawayEntries.giveawayId, giveawayId));
}

/** Entry counts per giveaway, for the dashboard and the card. */
export async function giveawayEntryCounts(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: giveawayEntries.giveawayId, n: count() })
    .from(giveawayEntries)
    .where(inArray(giveawayEntries.giveawayId, ids))
    .groupBy(giveawayEntries.giveawayId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

export async function listRunningGiveaways(db: Db): Promise<Giveaway[]> {
  return db.select().from(giveaways).where(eq(giveaways.status, "running"));
}

export async function listDueGiveaways(db: Db, now = new Date()): Promise<Giveaway[]> {
  return db
    .select()
    .from(giveaways)
    .where(and(eq(giveaways.status, "running"), lte(giveaways.endsAt, now)))
    .limit(25);
}

/**
 * End or cancel a running giveaway. Null when it wasn't running any more, so a
 * draw happens once even if two sweeps overlap.
 */
export async function finishGiveaway(
  db: Db,
  id: string,
  outcome: { status: "ended" | "cancelled"; winnerIds: string[] },
  now = new Date(),
): Promise<Giveaway | null> {
  const [row] = await db
    .update(giveaways)
    .set({ status: outcome.status, winnerIds: outcome.winnerIds, endedAt: now })
    .where(and(eq(giveaways.id, id), eq(giveaways.status, "running")))
    .returning();
  return row ?? null;
}

/** A reroll: the new winners replace the old. */
export async function setGiveawayWinners(db: Db, id: string, winnerIds: string[]) {
  await db.update(giveaways).set({ winnerIds }).where(eq(giveaways.id, id));
}

export async function setShownEntries(db: Db, id: string, n: number) {
  await db.update(giveaways).set({ shownEntries: n }).where(eq(giveaways.id, id));
}
