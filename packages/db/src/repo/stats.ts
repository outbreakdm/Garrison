import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { type StatChannel, statChannels, statsSettings } from "../schema";
import { readServerStats, type ServerStatsConfig } from "../server-stats";

export async function getServerStats(db: Db, guildId: string): Promise<ServerStatsConfig> {
  const [row] = await db.select().from(statsSettings).where(eq(statsSettings.guildId, guildId));
  return readServerStats(row ?? null);
}

/** The channels the bot shows counters in, for one server. */
export async function listStatChannels(db: Db, guildId: string): Promise<StatChannel[]> {
  return db.select().from(statChannels).where(eq(statChannels.guildId, guildId));
}

/**
 * Servers the bot has stats work in: switched on, or with channels it made that may need
 * removing now that they're off.
 */
export async function listStatsGuilds(db: Db, guildIds: string[]): Promise<string[]> {
  if (!guildIds.length) return [];
  const [on, made] = await Promise.all([
    db
      .select({ guildId: statsSettings.guildId })
      .from(statsSettings)
      .where(and(eq(statsSettings.enabled, true), inArray(statsSettings.guildId, guildIds))),
    db
      .selectDistinct({ guildId: statChannels.guildId })
      .from(statChannels)
      .where(inArray(statChannels.guildId, guildIds)),
  ]);
  return [...new Set([...on, ...made].map((r) => r.guildId))];
}

/** Record (or update) the channel a counter shows in. */
export async function saveStatChannel(
  db: Db,
  row: Pick<StatChannel, "guildId" | "counterKey" | "channelId" | "made" | "name"> & {
    count: number | null;
    renamed: boolean;
  },
) {
  const { renamed, ...values } = row;
  const set = {
    channelId: values.channelId,
    made: values.made,
    name: values.name,
    count: values.count,
    ...(renamed ? { renamedAt: new Date() } : {}),
  };
  await db
    .insert(statChannels)
    .values({ ...values, renamedAt: new Date() })
    .onConflictDoUpdate({ target: [statChannels.guildId, statChannels.counterKey], set });
}

export async function removeStatChannels(db: Db, guildId: string, keys: string[]) {
  if (!keys.length) return;
  await db
    .delete(statChannels)
    .where(and(eq(statChannels.guildId, guildId), inArray(statChannels.counterKey, keys)));
}
