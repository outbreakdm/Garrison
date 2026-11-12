import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { ServerBackup } from "../backups";
import type { Db } from "../client";
import { gatehouseSettings, serverBackups } from "../schema";

/** The list, newest first, without the snapshots themselves. */
export async function listBackups(db: Db, guildId: string) {
  return db
    .select({
      id: serverBackups.id,
      kind: serverBackups.kind,
      createdByName: serverBackups.createdByName,
      roleCount: serverBackups.roleCount,
      channelCount: serverBackups.channelCount,
      restoredAt: serverBackups.restoredAt,
      createdAt: serverBackups.createdAt,
    })
    .from(serverBackups)
    .where(eq(serverBackups.guildId, guildId))
    .orderBy(desc(serverBackups.createdAt))
    .limit(50);
}

export async function getBackup(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(serverBackups)
    .where(and(eq(serverBackups.guildId, guildId), eq(serverBackups.id, id)));
  return row ?? null;
}

/**
 * Save a backup. At the plan's limit, the oldest one goes to make room (one at a
 * time, so a server back on Free keeps what it saved on Pro until it rotates).
 */
export async function saveBackup(
  db: Db,
  b: {
    guildId: string;
    kind: "manual" | "weekly";
    createdById: string | null;
    createdByName: string | null;
    data: ServerBackup;
  },
  kept: number,
) {
  return db.transaction(async (tx) => {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: count() })
      .from(serverBackups)
      .where(eq(serverBackups.guildId, b.guildId));
    if (n >= kept) {
      const [oldest] = await tx
        .select({ id: serverBackups.id })
        .from(serverBackups)
        .where(eq(serverBackups.guildId, b.guildId))
        .orderBy(asc(serverBackups.createdAt))
        .limit(1);
      if (oldest) await tx.delete(serverBackups).where(eq(serverBackups.id, oldest.id));
    }
    const [row] = await tx
      .insert(serverBackups)
      .values({ ...b, roleCount: b.data.roles.length, channelCount: b.data.channels.length })
      .returning({ id: serverBackups.id, createdAt: serverBackups.createdAt });
    return row;
  });
}

/** Remember what a restore recreated (merged with earlier restores). */
export async function recordRestore(db: Db, id: string, map: Record<string, string>) {
  await db
    .update(serverBackups)
    .set({
      restoredMap: sql`${serverBackups.restoredMap} || ${JSON.stringify(map)}::jsonb`,
      restoredAt: new Date(),
    })
    .where(eq(serverBackups.id, id));
}

/** Pro servers due a weekly backup: on, and none taken in the last 7 days. */
export async function listWeeklyBackupsDue(db: Db, now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  return db
    .select({ guildId: gatehouseSettings.guildId })
    .from(gatehouseSettings)
    .where(
      and(
        eq(gatehouseSettings.backupWeekly, true),
        sql`NOT EXISTS (SELECT 1 FROM ${serverBackups} WHERE ${serverBackups.guildId} = ${gatehouseSettings.guildId} AND ${serverBackups.createdAt} > ${weekAgo})`,
      ),
    )
    .limit(25);
}
