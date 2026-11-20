import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "../client";
import { type ApplicationRow, applicationSettings, applications } from "../schema";
import type { VerifyAnswer } from "../verify-questions";

/** A server's forms, unchecked. Run them through readApplicationForms. */
export async function getApplicationForms(db: Db, guildId: string): Promise<unknown[]> {
  const [row] = await db
    .select({ forms: applicationSettings.forms })
    .from(applicationSettings)
    .where(eq(applicationSettings.guildId, guildId));
  return Array.isArray(row?.forms) ? row.forms : [];
}

export async function recordApplication(
  db: Db,
  row: {
    guildId: string;
    formId: string;
    formName: string;
    userId: string;
    username: string;
    answers: VerifyAnswer[];
  },
): Promise<ApplicationRow> {
  const [made] = await db.insert(applications).values(row).returning();
  if (!made) throw new Error("Application insert returned no row");
  return made;
}

/** Where the staff card for this application was posted. */
export async function setApplicationCard(
  db: Db,
  id: string,
  card: { channelId: string; messageId: string },
) {
  await db.update(applications).set(card).where(eq(applications.id, id));
}

/** A member's application to a form that's still waiting for staff, if any. */
export async function waitingApplication(db: Db, guildId: string, formId: string, userId: string) {
  const [row] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.guildId, guildId),
        eq(applications.formId, formId),
        eq(applications.userId, userId),
        eq(applications.status, "waiting"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Accept or decline, only while it's waiting: one decision lands. */
export async function decideApplication(
  db: Db,
  guildId: string,
  id: string,
  decision: { status: "accepted" | "declined"; decidedBy: string },
): Promise<ApplicationRow | null> {
  const [row] = await db
    .update(applications)
    .set({ ...decision, decidedAt: new Date() })
    .where(
      and(
        eq(applications.guildId, guildId),
        eq(applications.id, id),
        eq(applications.status, "waiting"),
      ),
    )
    .returning();
  return row ?? null;
}

/** One application on a server, or null. */
export async function getApplication(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.guildId, guildId), eq(applications.id, id)));
  return row ?? null;
}

/** The latest applications in a server, newest first, for the dashboard. */
export async function listApplications(db: Db, guildId: string, limit = 50) {
  return db
    .select()
    .from(applications)
    .where(eq(applications.guildId, guildId))
    .orderBy(desc(applications.createdAt))
    .limit(limit);
}

/** Delete applications older than `before` (kept APPLICATIONS_DAYS). */
export async function pruneApplications(db: Db, before: Date) {
  await db.delete(applications).where(lt(applications.createdAt, before));
}
