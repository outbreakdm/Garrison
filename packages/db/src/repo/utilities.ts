import { and, asc, count, eq, lt, lte } from "drizzle-orm";
import type { Db } from "../client";
import {
  memberRoleSnapshots,
  stickyPosts,
  type TimedRole,
  timedRoles,
  utilitySettings,
} from "../schema";
import { ROLE_SNAPSHOT_DAYS } from "../utilities";

/** A server's role and channel tools, unchecked: read the lists with readStickies and readClearRules. */
export async function getUtilitySettings(db: Db, guildId: string) {
  const [row] = await db.select().from(utilitySettings).where(eq(utilitySettings.guildId, guildId));
  return {
    restoreRoles: row?.restoreRoles ?? false,
    restoreSkipRoleIds: row?.restoreSkipRoleIds ?? [],
    stickies: (row?.stickies ?? []) as unknown[],
    clearing: (row?.clearing ?? []) as unknown[],
  };
}

/** Servers with any self-clearing channel saved, for the bot's sweep. */
export async function listClearingGuilds(
  db: Db,
): Promise<{ guildId: string; clearing: unknown[] }[]> {
  const rows = await db
    .select({ guildId: utilitySettings.guildId, clearing: utilitySettings.clearing })
    .from(utilitySettings);
  return rows
    .filter((r) => Array.isArray(r.clearing) && r.clearing.length)
    .map((r) => ({ guildId: r.guildId, clearing: r.clearing as unknown[] }));
}

/** The roles a member had when they left; the latest leave wins. */
export async function saveRoleSnapshot(
  db: Db,
  input: { guildId: string; userId: string; roleIds: string[] },
  now = new Date(),
) {
  if (!input.roleIds.length) {
    await takeRoleSnapshot(db, input.guildId, input.userId);
    return;
  }
  await db
    .insert(memberRoleSnapshots)
    .values({ ...input, leftAt: now })
    .onConflictDoUpdate({
      target: [memberRoleSnapshots.guildId, memberRoleSnapshots.userId],
      set: { roleIds: input.roleIds, leftAt: now },
    });
}

/** A rejoining member's saved roles, removed as they're read: they're given back once. */
export async function takeRoleSnapshot(
  db: Db,
  guildId: string,
  userId: string,
  now = new Date(),
): Promise<string[]> {
  const [row] = await db
    .delete(memberRoleSnapshots)
    .where(and(eq(memberRoleSnapshots.guildId, guildId), eq(memberRoleSnapshots.userId, userId)))
    .returning();
  if (!row) return [];
  if (now.getTime() - row.leftAt.getTime() > ROLE_SNAPSHOT_DAYS * 86_400_000) return [];
  return row.roleIds;
}

export async function pruneRoleSnapshots(db: Db, now = new Date()) {
  const before = new Date(now.getTime() - ROLE_SNAPSHOT_DAYS * 86_400_000);
  const gone = await db
    .delete(memberRoleSnapshots)
    .where(lt(memberRoleSnapshots.leftAt, before))
    .returning({ userId: memberRoleSnapshots.userId });
  return gone.length;
}

/** Give a timed role, or move its end if the member already has it as one. */
export async function setTimedRole(
  db: Db,
  input: { guildId: string; userId: string; roleId: string; expiresAt: Date; givenBy: string },
): Promise<TimedRole> {
  const [row] = await db
    .insert(timedRoles)
    .values(input)
    .onConflictDoUpdate({
      target: [timedRoles.guildId, timedRoles.userId, timedRoles.roleId],
      set: { expiresAt: input.expiresAt, givenBy: input.givenBy },
    })
    .returning();
  if (!row) throw new Error("Timed role insert returned no row");
  return row;
}

export async function getTimedRole(db: Db, guildId: string, userId: string, roleId: string) {
  const [row] = await db
    .select()
    .from(timedRoles)
    .where(
      and(
        eq(timedRoles.guildId, guildId),
        eq(timedRoles.userId, userId),
        eq(timedRoles.roleId, roleId),
      ),
    );
  return row ?? null;
}

export async function removeTimedRole(db: Db, id: string) {
  await db.delete(timedRoles).where(eq(timedRoles.id, id));
}

export async function countTimedRoles(db: Db, guildId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(timedRoles)
    .where(eq(timedRoles.guildId, guildId));
  return row?.n ?? 0;
}

/** A server's timed roles, the soonest to end first; one member's when `userId` is given. */
export async function listTimedRoles(db: Db, guildId: string, userId?: string, limit = 100) {
  return db
    .select()
    .from(timedRoles)
    .where(
      userId
        ? and(eq(timedRoles.guildId, guildId), eq(timedRoles.userId, userId))
        : eq(timedRoles.guildId, guildId),
    )
    .orderBy(asc(timedRoles.expiresAt))
    .limit(limit);
}

/** Timed roles whose time is up, oldest first. */
export async function dueTempRoles(db: Db, now = new Date(), limit = 50) {
  return db
    .select()
    .from(timedRoles)
    .where(lte(timedRoles.expiresAt, now))
    .orderBy(asc(timedRoles.expiresAt))
    .limit(limit);
}

export async function getStickyPost(db: Db, channelId: string) {
  const [row] = await db.select().from(stickyPosts).where(eq(stickyPosts.channelId, channelId));
  return row ?? null;
}

export async function setStickyPost(
  db: Db,
  input: { guildId: string; channelId: string; messageId: string },
  now = new Date(),
) {
  await db
    .insert(stickyPosts)
    .values({ ...input, postedAt: now })
    .onConflictDoUpdate({
      target: stickyPosts.channelId,
      set: { messageId: input.messageId, postedAt: now },
    });
}

export async function clearStickyPost(db: Db, channelId: string) {
  await db.delete(stickyPosts).where(eq(stickyPosts.channelId, channelId));
}
