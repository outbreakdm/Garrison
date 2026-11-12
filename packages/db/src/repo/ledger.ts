import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { type LedgerSettings, ledgerEvents, ledgerSettings, type NewLedgerEvent } from "../schema";

export async function getLedgerSettings(db: Db, guildId: string): Promise<LedgerSettings> {
  const [row] = await db.select().from(ledgerSettings).where(eq(ledgerSettings.guildId, guildId));
  return (
    row ?? {
      guildId,
      channelId: null,
      retentionDays: 30,
      keepMessageText: false,
      updatedAt: new Date(0),
    }
  );
}

export async function updateLedgerSettings(
  db: Db,
  guildId: string,
  patch: Partial<Pick<LedgerSettings, "channelId" | "retentionDays">>,
) {
  const [row] = await db
    .insert(ledgerSettings)
    .values({ guildId, ...patch })
    .onConflictDoUpdate({
      target: ledgerSettings.guildId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("Ledger settings upsert returned no row");
  return row;
}

export async function recordLedgerEvent(db: Db, event: NewLedgerEvent) {
  const [row] = await db.insert(ledgerEvents).values(event).returning();
  if (!row) throw new Error("Ledger insert returned no row");
  return row;
}

export interface LedgerQuery {
  guildId: string;
  /** Matches the actor or the target. */
  userId?: string;
  type?: string;
  /** Return events with an id below this (for "older" pages). */
  before?: number;
  limit?: number;
}

/** Newest first, filtered by user and type, paged by id. */
export async function searchLedger(db: Db, q: LedgerQuery) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
  const conditions = [eq(ledgerEvents.guildId, q.guildId)];
  if (q.userId)
    conditions.push(
      or(eq(ledgerEvents.actorId, q.userId), eq(ledgerEvents.targetId, q.userId)) ?? sql`true`,
    );
  if (q.type) conditions.push(eq(ledgerEvents.type, q.type));
  if (q.before) conditions.push(lt(ledgerEvents.id, q.before));
  return db
    .select()
    .from(ledgerEvents)
    .where(and(...conditions))
    .orderBy(desc(ledgerEvents.id))
    .limit(limit);
}

/** Remove events past each server's retention. Runs as the database owner via ledger_prune(). */
export async function pruneLedger(db: Db): Promise<number> {
  const result = await db.execute<{ ledger_prune: number }>(
    sql`select ledger_prune() as ledger_prune`,
  );
  const rows = (
    Array.isArray(result) ? result : (result as { rows: { ledger_prune: number }[] }).rows
  ) as {
    ledger_prune: number;
  }[];
  return Number(rows[0]?.ledger_prune ?? 0);
}

/** Who brought the most members in over the last `days` days, from joins with a known invite. */
export async function topInviters(db: Db, guildId: string, days = 30, limit = 10) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      inviterId: sql<string>`${ledgerEvents.data}->>'inviterId'`,
      inviterName: sql<string | null>`max(${ledgerEvents.data}->>'inviterName')`,
      joins: sql<number>`count(*)::int`,
    })
    .from(ledgerEvents)
    .where(
      and(
        eq(ledgerEvents.guildId, guildId),
        eq(ledgerEvents.type, "member_join"),
        gte(ledgerEvents.createdAt, since),
        sql`${ledgerEvents.data} ? 'inviterId' AND ${ledgerEvents.data}->>'inviterId' IS NOT NULL`,
      ),
    )
    .groupBy(sql`${ledgerEvents.data}->>'inviterId'`)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows;
}

/** Every event matching the filters, oldest first, for a CSV download (capped). */
export async function exportLedger(
  db: Db,
  q: { guildId: string; userId?: string; type?: string },
  limit = 20_000,
) {
  const conditions = [eq(ledgerEvents.guildId, q.guildId)];
  if (q.userId)
    conditions.push(
      or(eq(ledgerEvents.actorId, q.userId), eq(ledgerEvents.targetId, q.userId)) ?? sql`true`,
    );
  if (q.type) conditions.push(eq(ledgerEvents.type, q.type));
  return db
    .select()
    .from(ledgerEvents)
    .where(and(...conditions))
    .orderBy(asc(ledgerEvents.id))
    .limit(limit);
}
