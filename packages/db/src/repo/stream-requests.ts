import { and, desc, eq, lt, ne } from "drizzle-orm";
import { readStreamRequests, type StreamRequestsConfig } from "../alerts";
import type { Db } from "../client";
import type { PanelPlace } from "../panels";
import { alertSettings, type StreamRequest, streamRequests } from "../schema";

/** Members asking for their stream to be announced (alerts.ts): the settings and the requests. */

export async function getStreamRequests(db: Db, guildId: string): Promise<StreamRequestsConfig> {
  const [row] = await db.select().from(alertSettings).where(eq(alertSettings.guildId, guildId));
  return readStreamRequests(row ?? null);
}

/** Where the request panel now is: the bot records it after posting. Not a setting. */
export async function setStreamPanelMessage(db: Db, guildId: string, at: PanelPlace | null) {
  await db
    .update(alertSettings)
    .set({
      requestPanelChannelId: at?.channelId ?? null,
      requestPanelMessageId: at?.messageId ?? null,
    })
    .where(eq(alertSettings.guildId, guildId));
}

/** A new request, or null when this member already has one waiting. */
export async function createStreamRequest(
  db: Db,
  input: {
    guildId: string;
    userId: string;
    username: string;
    provider: string;
    handle: string;
    note: string | null;
  },
): Promise<StreamRequest | null> {
  const [row] = await db.insert(streamRequests).values(input).onConflictDoNothing().returning();
  return row ?? null;
}

export async function getStreamRequest(
  db: Db,
  guildId: string,
  id: string,
): Promise<StreamRequest | null> {
  const [row] = await db
    .select()
    .from(streamRequests)
    .where(and(eq(streamRequests.guildId, guildId), eq(streamRequests.id, id)));
  return row ?? null;
}

/** Requests waiting for staff, oldest first. */
export async function listStreamRequests(db: Db, guildId: string, limit = 25) {
  return db
    .select()
    .from(streamRequests)
    .where(and(eq(streamRequests.guildId, guildId), eq(streamRequests.status, "waiting")))
    .orderBy(streamRequests.createdAt)
    .limit(limit);
}

/** The latest decided requests, newest first, for the page's history. */
export async function listDecidedStreamRequests(db: Db, guildId: string, limit = 10) {
  return db
    .select()
    .from(streamRequests)
    .where(and(eq(streamRequests.guildId, guildId), ne(streamRequests.status, "waiting")))
    .orderBy(desc(streamRequests.decidedAt))
    .limit(limit);
}

/** Approve or decline, only while it waits: only one decision lands. */
export async function decideStreamRequest(
  db: Db,
  guildId: string,
  id: string,
  decision: { status: "approved" | "declined"; decidedBy: string },
): Promise<StreamRequest | null> {
  const [row] = await db
    .update(streamRequests)
    .set({ ...decision, decidedAt: new Date() })
    .where(
      and(
        eq(streamRequests.guildId, guildId),
        eq(streamRequests.id, id),
        eq(streamRequests.status, "waiting"),
      ),
    )
    .returning();
  return row ?? null;
}

/** An approval that couldn't add the alert goes back to waiting. */
export async function reopenStreamRequest(db: Db, id: string) {
  await db
    .update(streamRequests)
    .set({ status: "waiting", decidedBy: null, decidedAt: null })
    .where(eq(streamRequests.id, id));
}

export async function setStreamRequestCard(db: Db, id: string, at: PanelPlace) {
  await db
    .update(streamRequests)
    .set({ channelId: at.channelId, messageId: at.messageId })
    .where(eq(streamRequests.id, id));
}

/** Decided requests older than `before` are deleted; waiting ones stay until decided. */
export async function pruneStreamRequests(db: Db, before: Date) {
  await db
    .delete(streamRequests)
    .where(and(ne(streamRequests.status, "waiting"), lt(streamRequests.decidedAt, before)));
}
