import { and, desc, eq, max } from "drizzle-orm";
import type { Db } from "../client";
import { type MessageSend, messageSends, messageSettings } from "../schema";

/** The stored list, unchecked. Run it through readMessages or checkMessages. */
export async function getMessages(db: Db, guildId: string): Promise<unknown[]> {
  const [row] = await db
    .select({ messages: messageSettings.messages })
    .from(messageSettings)
    .where(eq(messageSettings.guildId, guildId));
  return Array.isArray(row?.messages) ? row.messages : [];
}

/** Bot side: every server's list, for the scheduler. */
export async function listAllMessages(db: Db): Promise<{ guildId: string; messages: unknown[] }[]> {
  return db
    .select({ guildId: messageSettings.guildId, messages: messageSettings.messages })
    .from(messageSettings);
}

/** When each message last went out (its latest occurrence). */
export async function lastSends(db: Db, guildId: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({ messageId: messageSends.messageId, last: max(messageSends.occurrence) })
    .from(messageSends)
    .where(eq(messageSends.guildId, guildId))
    .groupBy(messageSends.messageId);
  return new Map(rows.flatMap((r) => (r.last ? [[r.messageId, r.last] as const] : [])));
}

export async function listMessageSends(
  db: Db,
  guildId: string,
  limit = 20,
): Promise<MessageSend[]> {
  return db
    .select()
    .from(messageSends)
    .where(eq(messageSends.guildId, guildId))
    .orderBy(desc(messageSends.sentAt))
    .limit(limit);
}

/**
 * Bot side: claim one send before posting it. False when it was already claimed
 * (another sweep, or a restart), so it's never posted twice.
 */
export async function claimSend(
  db: Db,
  send: { guildId: string; messageId: string; occurrence: Date; channelId: string },
): Promise<boolean> {
  const rows = await db
    .insert(messageSends)
    .values(send)
    .onConflictDoNothing()
    .returning({ messageId: messageSends.messageId });
  return rows.length > 0;
}

export async function recordSentMessage(
  db: Db,
  send: { guildId: string; messageId: string; occurrence: Date },
  discordMessageId: string,
) {
  await db
    .update(messageSends)
    .set({ discordMessageId })
    .where(
      and(
        eq(messageSends.guildId, send.guildId),
        eq(messageSends.messageId, send.messageId),
        eq(messageSends.occurrence, send.occurrence),
      ),
    );
}
