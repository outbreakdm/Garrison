import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import {
  escalationRules,
  gatehouseSettings,
  guilds,
  type WatchSettings,
  watchSettings,
} from "../schema";

/** Rules every new guild starts with. Staff can change them later. */
export const DEFAULT_ESCALATION_RULES = [
  { warnCount: 3, windowMinutes: 24 * 60, action: "timeout" as const, durationSeconds: 60 * 60 },
];

/**
 * Record that Garrison is in a guild. First join seeds default Watch settings
 * and escalation rules; a rejoin only refreshes the name and clears `leftAt`.
 */
export async function upsertGuild(db: Db, guild: { id: string; name: string }) {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(guilds)
      .values({ id: guild.id, name: guild.name })
      .onConflictDoNothing()
      .returning({ id: guilds.id });

    if (inserted.length === 0) {
      await tx
        .update(guilds)
        .set({ name: guild.name, leftAt: null })
        .where(eq(guilds.id, guild.id));
      return { created: false };
    }

    await tx.insert(watchSettings).values({ guildId: guild.id }).onConflictDoNothing();
    await tx.insert(gatehouseSettings).values({ guildId: guild.id }).onConflictDoNothing();
    await tx
      .insert(escalationRules)
      .values(DEFAULT_ESCALATION_RULES.map((r) => ({ ...r, guildId: guild.id })))
      .onConflictDoNothing();
    return { created: true };
  });
}

export async function markGuildLeft(db: Db, guildId: string) {
  await db.update(guilds).set({ leftAt: new Date() }).where(eq(guilds.id, guildId));
}

export async function getWatchSettings(db: Db, guildId: string): Promise<WatchSettings> {
  const [row] = await db.select().from(watchSettings).where(eq(watchSettings.guildId, guildId));
  if (row) return row;
  const [created] = await db
    .insert(watchSettings)
    .values({ guildId })
    .onConflictDoUpdate({ target: watchSettings.guildId, set: { guildId } })
    .returning();
  if (!created) throw new Error(`Could not create Watch settings for guild ${guildId}`);
  return created;
}

/** What the website verify page needs. Read-only. Null when verification isn't on the website. */
export async function webVerifySettings(db: Db, guildId: string) {
  const [row] = await db
    .select({
      roleId: gatehouseSettings.verifyRoleId,
      minAge: gatehouseSettings.verifyMinAccountAgeDays,
      web: gatehouseSettings.verifyWeb,
    })
    .from(gatehouseSettings)
    .where(eq(gatehouseSettings.guildId, guildId));
  return row?.roleId && row.web ? { roleId: row.roleId, minAge: row.minAge } : null;
}

/** Are appeals open for this server? Read-only (the dashboard can't create the settings row). */
export async function appealsOpen(db: Db, guildId: string): Promise<boolean> {
  const [row] = await db
    .select({ on: watchSettings.appealsEnabled })
    .from(watchSettings)
    .where(eq(watchSettings.guildId, guildId));
  return row?.on === true;
}

export type WatchSettingsPatch = Partial<
  Pick<WatchSettings, "logChannelId" | "dmMembers" | "appealText">
>;

export async function updateWatchSettings(db: Db, guildId: string, patch: WatchSettingsPatch) {
  await getWatchSettings(db, guildId);
  const [row] = await db
    .update(watchSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(watchSettings.guildId, guildId))
    .returning();
  if (!row) throw new Error(`Watch settings missing for guild ${guildId}`);
  return row;
}

export async function listEscalationRules(db: Db, guildId: string) {
  return db
    .select()
    .from(escalationRules)
    .where(and(eq(escalationRules.guildId, guildId), eq(escalationRules.enabled, true)))
    .orderBy(asc(escalationRules.warnCount));
}
