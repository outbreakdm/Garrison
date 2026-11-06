import { and, count, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  gatehouseSettings,
  guilds,
  lfgPosts,
  lockdowns,
  modCases,
  opsEvents,
  quarantines,
  watchSettings,
  webSessions,
} from "../schema";

// --- Sessions --------------------------------------------------------------

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  username: string;
  manageableGuildIds: string[];
  expiresAt: Date;
}

export async function createWebSession(db: Db, input: CreateSessionInput) {
  await db.insert(webSessions).values(input);
}

/** A live session: not revoked and not expired. */
export async function getWebSession(db: Db, tokenHash: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(webSessions)
    .where(
      and(
        eq(webSessions.tokenHash, tokenHash),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, now),
      ),
    );
  return row ?? null;
}

export async function touchWebSession(db: Db, tokenHash: string) {
  await db
    .update(webSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(webSessions.tokenHash, tokenHash));
}

export async function revokeWebSession(db: Db, tokenHash: string) {
  await db
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(webSessions.tokenHash, tokenHash), isNull(webSessions.revokedAt)));
}

// --- Dashboard reads -------------------------------------------------------

/** Guilds Garrison is currently in, out of `ids`. */
export async function listActiveGuilds(db: Db, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: guilds.id, name: guilds.name })
    .from(guilds)
    .where(and(inArray(guilds.id, ids), isNull(guilds.leftAt)))
    .orderBy(guilds.name);
}

export async function getActiveGuild(db: Db, id: string) {
  const [row] = await db
    .select({ id: guilds.id, name: guilds.name })
    .from(guilds)
    .where(and(eq(guilds.id, id), isNull(guilds.leftAt)));
  return row ?? null;
}

export async function getOverview(db: Db, guildId: string, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [[cases], [auto], [groups], nextOp, [lockdown], [gate], [watch], [quarantined]] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(modCases)
        .where(and(eq(modCases.guildId, guildId), gte(modCases.createdAt, dayAgo))),
      db
        .select({ n: count() })
        .from(modCases)
        .where(
          and(
            eq(modCases.guildId, guildId),
            gte(modCases.createdAt, dayAgo),
            sql`${modCases.source} <> 'manual'`,
          ),
        ),
      db
        .select({ n: count() })
        .from(lfgPosts)
        .where(and(eq(lfgPosts.guildId, guildId), inArray(lfgPosts.status, ["open", "full"]))),
      db
        .select()
        .from(opsEvents)
        .where(and(eq(opsEvents.guildId, guildId), eq(opsEvents.status, "scheduled")))
        .orderBy(opsEvents.startsAt)
        .limit(1),
      db
        .select()
        .from(lockdowns)
        .where(and(eq(lockdowns.guildId, guildId), isNull(lockdowns.endedAt))),
      db.select().from(gatehouseSettings).where(eq(gatehouseSettings.guildId, guildId)),
      db.select().from(watchSettings).where(eq(watchSettings.guildId, guildId)),
      db
        .select({ n: count() })
        .from(quarantines)
        .where(
          and(
            eq(quarantines.guildId, guildId),
            isNull(quarantines.restoredAt),
            gte(quarantines.createdAt, dayAgo),
          ),
        ),
    ]);
  return {
    modActions24h: cases?.n ?? 0,
    automatic24h: auto?.n ?? 0,
    openGroups: groups?.n ?? 0,
    nextOp: nextOp[0] ?? null,
    activeLockdown: lockdown ?? null,
    gatehouse: gate ?? null,
    watch: watch ?? null,
    quarantines24h: quarantined?.n ?? 0,
  };
}

export async function listRecentCases(db: Db, guildId: string, limit = 25) {
  return db
    .select()
    .from(modCases)
    .where(eq(modCases.guildId, guildId))
    .orderBy(desc(modCases.caseNumber))
    .limit(limit);
}
