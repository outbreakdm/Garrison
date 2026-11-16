import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../client";
import { type VerifyAnswersRow, verifyAnswers } from "../schema";
import type { VerifyAnswer } from "../verify-questions";

/** A member's answers, as they arrive. */
export async function recordVerifyAnswers(
  db: Db,
  row: {
    guildId: string;
    userId: string;
    username: string;
    answers: VerifyAnswer[];
    status: "waiting" | "verified";
  },
): Promise<VerifyAnswersRow> {
  const [made] = await db
    .insert(verifyAnswers)
    .values({ ...row, decidedAt: row.status === "verified" ? new Date() : null })
    .returning();
  if (!made) throw new Error("Answers insert returned no row");
  return made;
}

/** Where the staff card for these answers was posted. */
export async function setVerifyAnswersCard(
  db: Db,
  id: string,
  card: { channelId: string; messageId: string },
) {
  await db.update(verifyAnswers).set(card).where(eq(verifyAnswers.id, id));
}

export async function getVerifyAnswers(
  db: Db,
  guildId: string,
  id: string,
): Promise<VerifyAnswersRow | null> {
  const [row] = await db
    .select()
    .from(verifyAnswers)
    .where(and(eq(verifyAnswers.guildId, guildId), eq(verifyAnswers.id, id)));
  return row ?? null;
}

/** This member's answers still waiting for staff, if any. */
export async function waitingVerifyAnswers(
  db: Db,
  guildId: string,
  userId: string,
): Promise<VerifyAnswersRow | null> {
  const [row] = await db
    .select()
    .from(verifyAnswers)
    .where(
      and(
        eq(verifyAnswers.guildId, guildId),
        eq(verifyAnswers.userId, userId),
        eq(verifyAnswers.status, "waiting"),
      ),
    )
    .orderBy(desc(verifyAnswers.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Approve or deny answers still waiting. Only one decision lands: a second click (or the
 * card and the dashboard at once) gets null.
 */
export async function decideVerifyAnswers(
  db: Db,
  guildId: string,
  id: string,
  decision: { status: "approved" | "denied"; decidedBy: string },
): Promise<VerifyAnswersRow | null> {
  const [row] = await db
    .update(verifyAnswers)
    .set({ ...decision, decidedAt: new Date() })
    .where(
      and(
        eq(verifyAnswers.guildId, guildId),
        eq(verifyAnswers.id, id),
        eq(verifyAnswers.status, "waiting"),
      ),
    )
    .returning();
  return row ?? null;
}

/** The latest answers in a server, newest first, for the dashboard. */
export async function listVerifyAnswers(
  db: Db,
  guildId: string,
  limit = 20,
): Promise<VerifyAnswersRow[]> {
  return db
    .select()
    .from(verifyAnswers)
    .where(eq(verifyAnswers.guildId, guildId))
    .orderBy(desc(verifyAnswers.createdAt))
    .limit(limit);
}

/** Answers are kept 30 days. */
export async function pruneVerifyAnswers(db: Db, before: Date) {
  await db.delete(verifyAnswers).where(lt(verifyAnswers.createdAt, before));
}
