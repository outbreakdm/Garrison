import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { type StarboardPost, starboardPosts, starboardSettings } from "../schema";
import { readStarboard, type StarboardConfig } from "../starboard";

export async function getStarboard(db: Db, guildId: string): Promise<StarboardConfig> {
  const [row] = await db
    .select()
    .from(starboardSettings)
    .where(eq(starboardSettings.guildId, guildId));
  return readStarboard(row ?? null);
}

export async function getStarPost(
  db: Db,
  guildId: string,
  messageId: string,
): Promise<StarboardPost | null> {
  const [row] = await db
    .select()
    .from(starboardPosts)
    .where(and(eq(starboardPosts.guildId, guildId), eq(starboardPosts.messageId, messageId)));
  return row ?? null;
}

/** Claim a message for the board. True only for the caller that gets to post it. */
export async function claimStarPost(
  db: Db,
  post: { guildId: string; messageId: string; channelId: string; authorId: string; stars: number },
) {
  const rows = await db
    .insert(starboardPosts)
    .values(post)
    .onConflictDoNothing()
    .returning({ messageId: starboardPosts.messageId });
  return rows.length > 0;
}

export async function setStarMessage(
  db: Db,
  guildId: string,
  messageId: string,
  starMessageId: string,
) {
  await db
    .update(starboardPosts)
    .set({ starMessageId, updatedAt: new Date() })
    .where(and(eq(starboardPosts.guildId, guildId), eq(starboardPosts.messageId, messageId)));
}

/** A repost that failed gives its claim back (only while nothing reached Discord). */
export async function releaseStarPost(db: Db, guildId: string, messageId: string) {
  await db
    .delete(starboardPosts)
    .where(
      and(
        eq(starboardPosts.guildId, guildId),
        eq(starboardPosts.messageId, messageId),
        isNull(starboardPosts.starMessageId),
      ),
    );
}

export async function setStarCount(db: Db, guildId: string, messageId: string, stars: number) {
  await db
    .update(starboardPosts)
    .set({ stars, updatedAt: new Date() })
    .where(and(eq(starboardPosts.guildId, guildId), eq(starboardPosts.messageId, messageId)));
}

export async function listStarPosts(db: Db, guildId: string, limit = 25): Promise<StarboardPost[]> {
  return db
    .select()
    .from(starboardPosts)
    .where(eq(starboardPosts.guildId, guildId))
    .orderBy(desc(starboardPosts.createdAt))
    .limit(limit);
}
