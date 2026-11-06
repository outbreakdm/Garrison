import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { guilds, type ModCase, modCases, type NewModCase } from "../schema";

/**
 * Create a case with the guild's next case number. The counter update and the
 * insert share a transaction, and the row lock on `guilds` serialises
 * concurrent cases in the same guild, so numbers never repeat or skip.
 */
export async function createCase(db: Db, input: NewModCase): Promise<ModCase> {
  return db.transaction(async (tx) => {
    const [counter] = await tx
      .update(guilds)
      .set({ caseCounter: sql`${guilds.caseCounter} + 1` })
      .where(eq(guilds.id, input.guildId))
      .returning({ caseNumber: guilds.caseCounter });
    if (!counter) throw new Error(`Guild ${input.guildId} is not registered`);

    const [row] = await tx
      .insert(modCases)
      .values({ ...input, caseNumber: counter.caseNumber })
      .returning();
    if (!row) throw new Error("Case insert returned no row");
    return row;
  });
}

export async function getCase(db: Db, guildId: string, caseNumber: number) {
  const [row] = await db
    .select()
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber)));
  return row ?? null;
}

export async function listCasesForTarget(db: Db, guildId: string, targetId: string, limit = 10) {
  return db
    .select()
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, targetId)))
    .orderBy(desc(modCases.caseNumber))
    .limit(limit);
}

/** Warnings that count toward escalation: not revoked, created at or after `since`. */
export async function countActiveWarnings(db: Db, guildId: string, targetId: string, since: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(modCases)
    .where(
      and(
        eq(modCases.guildId, guildId),
        eq(modCases.targetId, targetId),
        eq(modCases.action, "warn"),
        isNull(modCases.revokedAt),
        gte(modCases.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Mark a case as undone. Returns the updated case, or null when the case does
 * not exist or was already revoked (so a double-clicked Undo is harmless).
 */
export async function revokeCase(db: Db, guildId: string, caseNumber: number, revokedById: string) {
  const [row] = await db
    .update(modCases)
    .set({ revokedAt: new Date(), revokedById })
    .where(
      and(
        eq(modCases.guildId, guildId),
        eq(modCases.caseNumber, caseNumber),
        isNull(modCases.revokedAt),
      ),
    )
    .returning();
  return row ?? null;
}
