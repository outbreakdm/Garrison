import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  type GatehouseSettings,
  gatehouseSettings,
  type LockdownSnapshotEntry,
  lockdowns,
  quarantines,
} from "../schema.js";

export async function getGatehouseSettings(db: Db, guildId: string): Promise<GatehouseSettings> {
  const [row] = await db
    .select()
    .from(gatehouseSettings)
    .where(eq(gatehouseSettings.guildId, guildId));
  if (row) return row;
  const [created] = await db
    .insert(gatehouseSettings)
    .values({ guildId })
    .onConflictDoUpdate({ target: gatehouseSettings.guildId, set: { guildId } })
    .returning();
  if (!created) throw new Error(`Could not create Gatehouse settings for guild ${guildId}`);
  return created;
}

export type GatehouseSettingsPatch = Partial<Omit<GatehouseSettings, "guildId" | "updatedAt">>;

export async function updateGatehouseSettings(
  db: Db,
  guildId: string,
  patch: GatehouseSettingsPatch,
) {
  await getGatehouseSettings(db, guildId);
  const [row] = await db
    .update(gatehouseSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(gatehouseSettings.guildId, guildId))
    .returning();
  if (!row) throw new Error(`Gatehouse settings missing for guild ${guildId}`);
  return row;
}

export async function getActiveLockdown(db: Db, guildId: string) {
  const [row] = await db
    .select()
    .from(lockdowns)
    .where(and(eq(lockdowns.guildId, guildId), isNull(lockdowns.endedAt)));
  return row ?? null;
}

export interface StartLockdownInput {
  guildId: string;
  source: "manual" | "anti_raid";
  reason: string | null;
  startedById: string;
  endsAt: Date | null;
}

/**
 * Claim the guild's single active-lockdown slot. Returns null if a lockdown is
 * already active (the partial unique index enforces one at a time), so two
 * raid triggers racing each other start only one lockdown.
 */
export async function startLockdown(db: Db, input: StartLockdownInput) {
  const [row] = await db.insert(lockdowns).values(input).onConflictDoNothing().returning();
  return row ?? null;
}

/** Record what a lockdown changed, so it can be restored later. */
export async function saveLockdownSnapshot(
  db: Db,
  id: string,
  snapshot: LockdownSnapshotEntry[],
  invitesPaused: boolean,
) {
  await db.update(lockdowns).set({ snapshot, invitesPaused }).where(eq(lockdowns.id, id));
}

/** Mark a lockdown ended. Returns null if it had already ended. */
export async function endLockdown(db: Db, id: string, endedById: string) {
  const [row] = await db
    .update(lockdowns)
    .set({ endedAt: new Date(), endedById })
    .where(and(eq(lockdowns.id, id), isNull(lockdowns.endedAt)))
    .returning();
  return row ?? null;
}

/** Active lockdowns whose `endsAt` has passed. */
export async function listExpiredLockdowns(db: Db, now = new Date()) {
  return db
    .select()
    .from(lockdowns)
    .where(and(isNull(lockdowns.endedAt), isNotNull(lockdowns.endsAt), lte(lockdowns.endsAt, now)));
}

export interface CreateQuarantineInput {
  guildId: string;
  userId: string;
  userTag: string;
  reason: string;
  removedRoleIds: string[];
  kicked: boolean;
}

export async function createQuarantine(db: Db, input: CreateQuarantineInput) {
  const [row] = await db.insert(quarantines).values(input).returning();
  if (!row) throw new Error("Quarantine insert returned no row");
  return row;
}

export async function getQuarantine(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(quarantines)
    .where(and(eq(quarantines.guildId, guildId), eq(quarantines.id, id)));
  return row ?? null;
}

/** Mark a quarantine restored. Returns null if it was already restored. */
export async function markQuarantineRestored(db: Db, id: string, restoredById: string) {
  const [row] = await db
    .update(quarantines)
    .set({ restoredAt: new Date(), restoredById })
    .where(and(eq(quarantines.id, id), isNull(quarantines.restoredAt)))
    .returning();
  return row ?? null;
}
