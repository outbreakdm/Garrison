import { and, asc, desc, eq, gte, isNull, ne } from "drizzle-orm";
import type { Db } from "../client";
import { type Appeal, appeals, type MemberNote, memberNotes } from "../schema";

export const NOTE_MAX = 1000;
export const APPEAL_MIN = 20;
export const APPEAL_MAX = 2000;
/** After a denial, how long before the same person can appeal again in that server. */
export const APPEAL_COOLDOWN_MS = 7 * 86_400_000;

// --- Notes ---------------------------------------------------------------------

export async function addMemberNote(
  db: Db,
  note: { guildId: string; userId: string; authorId: string; authorName: string; body: string },
): Promise<MemberNote> {
  const [row] = await db
    .insert(memberNotes)
    .values({ ...note, body: note.body.trim().slice(0, NOTE_MAX) })
    .returning();
  if (!row) throw new Error("Note not saved");
  return row;
}

export async function listMemberNotes(db: Db, guildId: string, userId: string, limit = 50) {
  return db
    .select()
    .from(memberNotes)
    .where(
      and(
        eq(memberNotes.guildId, guildId),
        eq(memberNotes.userId, userId),
        isNull(memberNotes.removedAt),
      ),
    )
    .orderBy(desc(memberNotes.id))
    .limit(limit);
}

/** Remove a note (kept, marked removed). False if it wasn't there. */
export async function removeMemberNote(db: Db, guildId: string, id: number, removedBy: string) {
  const rows = await db
    .update(memberNotes)
    .set({ removedAt: new Date(), removedBy })
    .where(
      and(eq(memberNotes.guildId, guildId), eq(memberNotes.id, id), isNull(memberNotes.removedAt)),
    )
    .returning({ id: memberNotes.id });
  return rows.length > 0;
}

// --- Appeals ---------------------------------------------------------------------

export async function listAppealsForUser(db: Db, guildId: string, userId: string) {
  return db
    .select()
    .from(appeals)
    .where(and(eq(appeals.guildId, guildId), eq(appeals.userId, userId)))
    .orderBy(desc(appeals.createdAt))
    .limit(10);
}

/** Can this person appeal now? One open appeal at a time; a week after a denial. */
export function appealBlock(past: Pick<Appeal, "status" | "decidedAt">[], now = new Date()) {
  if (past.some((a) => a.status === "open")) return "open" as const;
  const denied = past.find((a) => a.status === "denied" && a.decidedAt);
  if (denied?.decidedAt && now.getTime() - denied.decidedAt.getTime() < APPEAL_COOLDOWN_MS)
    return "cooldown" as const;
  return null;
}

export async function createAppeal(
  db: Db,
  a: { guildId: string; userId: string; username: string; caseNumber: number | null; body: string },
): Promise<Appeal> {
  const [row] = await db.insert(appeals).values(a).returning();
  if (!row) throw new Error("Appeal not saved");
  return row;
}

/** The queue: open appeals oldest first, then the latest decided ones. */
export async function listAppeals(db: Db, guildId: string) {
  const [open, decided] = await Promise.all([
    db
      .select()
      .from(appeals)
      .where(and(eq(appeals.guildId, guildId), eq(appeals.status, "open")))
      .orderBy(asc(appeals.createdAt))
      .limit(50),
    db
      .select()
      .from(appeals)
      .where(
        and(
          eq(appeals.guildId, guildId),
          ne(appeals.status, "open"),
          gte(appeals.decidedAt, new Date(Date.now() - 30 * 86_400_000)),
        ),
      )
      .orderBy(desc(appeals.decidedAt))
      .limit(20),
  ]);
  return { open, decided };
}

export async function getAppeal(db: Db, guildId: string, id: string): Promise<Appeal | null> {
  const [row] = await db
    .select()
    .from(appeals)
    .where(and(eq(appeals.guildId, guildId), eq(appeals.id, id)));
  return row ?? null;
}

/** Decide an open appeal. Null if someone decided it first. */
export async function decideAppeal(
  db: Db,
  d: {
    guildId: string;
    id: string;
    status: "accepted" | "denied";
    response: string | null;
    reviewer: { id: string; name: string };
  },
) {
  const [row] = await db
    .update(appeals)
    .set({
      status: d.status,
      response: d.response,
      reviewerId: d.reviewer.id,
      reviewerName: d.reviewer.name,
      decidedAt: new Date(),
    })
    .where(and(eq(appeals.guildId, d.guildId), eq(appeals.id, d.id), eq(appeals.status, "open")))
    .returning();
  return row ?? null;
}
