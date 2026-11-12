import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { type AlertStateRow, alertSettings, alertState } from "../schema";

/** The stored feed list, unchecked. Run it through readAlertFeeds or checkAlertFeeds. */
export async function getAlertFeeds(db: Db, guildId: string): Promise<unknown[]> {
  const [row] = await db
    .select({ feeds: alertSettings.feeds })
    .from(alertSettings)
    .where(eq(alertSettings.guildId, guildId));
  return Array.isArray(row?.feeds) ? row.feeds : [];
}

/** Bot side: every server with at least one feed. */
export async function listAlertSettings(db: Db): Promise<{ guildId: string; feeds: unknown[] }[]> {
  return db
    .select({ guildId: alertSettings.guildId, feeds: alertSettings.feeds })
    .from(alertSettings)
    .where(sql`jsonb_array_length(${alertSettings.feeds}) > 0`);
}

export async function listAlertState(db: Db, guildId?: string): Promise<AlertStateRow[]> {
  return guildId
    ? db.select().from(alertState).where(eq(alertState.guildId, guildId))
    : db.select().from(alertState);
}

type Key = { guildId: string; feedId: string };

/** Bot side: note a check (and anything learned), without touching the last item. */
export async function noteAlertCheck(
  db: Db,
  key: Key,
  patch: { resolvedId?: string | null; liveSince?: Date | null; problem?: string | null },
  now = new Date(),
) {
  await db
    .insert(alertState)
    .values({ ...key, ...patch, checkedAt: now })
    .onConflictDoUpdate({
      target: [alertState.guildId, alertState.feedId],
      set: { ...patch, checkedAt: now },
    });
}

/**
 * Bot side: swap in a new last item. True only for the call that changed it, so
 * an item is posted once even if two sweeps overlap.
 */
export async function claimAlertItem(
  db: Db,
  key: Key,
  itemId: string,
  opts: { post: boolean; liveSince?: Date | null },
  now = new Date(),
): Promise<boolean> {
  const set = {
    lastItemId: itemId,
    checkedAt: now,
    problem: null,
    ...(opts.post ? { postedAt: now } : {}),
    ...(opts.liveSince !== undefined ? { liveSince: opts.liveSince } : {}),
  };
  const rows = await db
    .insert(alertState)
    .values({ ...key, ...set })
    .onConflictDoUpdate({
      target: [alertState.guildId, alertState.feedId],
      set,
      setWhere: or(sql`${alertState.lastItemId} IS NULL`, ne(alertState.lastItemId, itemId)),
    })
    .returning({ feedId: alertState.feedId });
  return rows.length > 0;
}

/** Feeds that have posted at least once, for the dashboard's "last alert". */
export async function lastAlertTimes(db: Db, guildId: string) {
  const rows = await db
    .select({ feedId: alertState.feedId, postedAt: alertState.postedAt })
    .from(alertState)
    .where(and(eq(alertState.guildId, guildId), isNotNull(alertState.postedAt)));
  return new Map(rows.map((r) => [r.feedId, r.postedAt as Date]));
}
