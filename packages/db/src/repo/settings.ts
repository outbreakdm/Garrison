import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import {
  gatehouseSettings,
  opsSettings,
  type SettingsChange,
  type SettingsDiff,
  type SettingsModule,
  settingsChanges,
  watchSettings,
} from "../schema";

/**
 * The only fields the dashboard may change, per module. Anything else in a
 * patch is ignored. Anti-nuke settings and the trusted list are deliberately
 * absent: they stay owner-only commands in Discord.
 */
export const EDITABLE_FIELDS = {
  watch: ["logChannelId", "dmMembers", "appealText"],
  gatehouse: [
    "alertChannelId",
    "antiRaidEnabled",
    "raidJoinCount",
    "raidWindowSeconds",
    "raidResponse",
    "autoUnlockMinutes",
    "flagAccountAgeDays",
  ],
  ops: ["timezone"],
} as const satisfies Record<SettingsModule, readonly string[]>;

const TABLES = { watch: watchSettings, gatehouse: gatehouseSettings, ops: opsSettings } as const;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function lockRow(tx: Tx, module: SettingsModule, guildId: string): Promise<Row | null> {
  const table = TABLES[module];
  if (module === "ops") {
    // Ops settings rows are created lazily.
    await tx.insert(opsSettings).values({ guildId }).onConflictDoNothing();
  }
  const [row] = await tx.select().from(table).where(eq(table.guildId, guildId)).for("update");
  return (row as Row | undefined) ?? null;
}

/** Write whitelisted values. Callers only pass fields from EDITABLE_FIELDS. */
async function writeRow(tx: Tx, module: SettingsModule, guildId: string, values: Row) {
  const set = { ...values, updatedAt: new Date() };
  switch (module) {
    case "watch":
      await tx
        .update(watchSettings)
        .set(set as Partial<typeof watchSettings.$inferInsert>)
        .where(eq(watchSettings.guildId, guildId));
      return;
    case "gatehouse":
      await tx
        .update(gatehouseSettings)
        .set(set as Partial<typeof gatehouseSettings.$inferInsert>)
        .where(eq(gatehouseSettings.guildId, guildId));
      return;
    case "ops":
      await tx
        .update(opsSettings)
        .set(set as Partial<typeof opsSettings.$inferInsert>)
        .where(eq(opsSettings.guildId, guildId));
      return;
  }
}

export interface ApplyInput {
  guildId: string;
  module: SettingsModule;
  patch: Record<string, unknown>;
  userId: string;
  username: string;
}

export type ApplyResult =
  | { ok: true; change: SettingsChange }
  | { ok: false; reason: "unchanged" | "not_ready" };

/** Apply a whitelisted patch and record exactly what changed, in one transaction. */
export async function applySettingsChange(db: Db, input: ApplyInput): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const row = await lockRow(tx, input.module, input.guildId);
    if (!row) return { ok: false, reason: "not_ready" };

    const diff: SettingsDiff = {};
    const values: Row = {};
    for (const field of EDITABLE_FIELDS[input.module] as readonly string[]) {
      if (!(field in input.patch)) continue;
      const to = input.patch[field];
      if (same(row[field], to)) continue;
      diff[field] = { from: row[field] ?? null, to: to ?? null };
      values[field] = to;
    }
    if (!Object.keys(diff).length) return { ok: false, reason: "unchanged" };

    await writeRow(tx, input.module, input.guildId, values);
    const [change] = await tx
      .insert(settingsChanges)
      .values({
        guildId: input.guildId,
        module: input.module,
        changes: diff,
        userId: input.userId,
        username: input.username,
      })
      .returning();
    if (!change) throw new Error("Change insert returned no row");
    return { ok: true, change };
  });
}

export type UndoResult =
  | { ok: true; change: SettingsChange }
  | { ok: false; reason: "not_found" | "already_undone" | "conflict" | "is_undo" };

/**
 * Undo a change, but only if every field still holds the value it set.
 * Otherwise someone changed it since, and undoing would clobber their edit.
 */
export async function undoSettingsChange(
  db: Db,
  guildId: string,
  changeId: string,
  user: { userId: string; username: string },
): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(settingsChanges)
      .where(and(eq(settingsChanges.guildId, guildId), eq(settingsChanges.id, changeId)));
    if (!original) return { ok: false, reason: "not_found" };
    if (original.revertsChangeId) return { ok: false, reason: "is_undo" };

    const row = await lockRow(tx, original.module, guildId);
    if (!row) return { ok: false, reason: "not_found" };
    const [existing] = await tx
      .select({ id: settingsChanges.id })
      .from(settingsChanges)
      .where(eq(settingsChanges.revertsChangeId, changeId));
    if (existing) return { ok: false, reason: "already_undone" };

    const allowed = EDITABLE_FIELDS[original.module] as readonly string[];
    const diff: SettingsDiff = {};
    const values: Row = {};
    for (const [field, { from, to }] of Object.entries(original.changes)) {
      if (!allowed.includes(field)) continue;
      if (!same(row[field], to)) return { ok: false, reason: "conflict" };
      diff[field] = { from: to, to: from };
      values[field] = from;
    }
    await writeRow(tx, original.module, guildId, values);
    const [change] = await tx
      .insert(settingsChanges)
      .values({
        guildId,
        module: original.module,
        changes: diff,
        revertsChangeId: changeId,
        ...user,
      })
      .returning();
    if (!change) throw new Error("Undo insert returned no row");
    return { ok: true, change };
  });
}

export async function listSettingsChanges(db: Db, guildId: string, limit = 20) {
  return db
    .select()
    .from(settingsChanges)
    .where(eq(settingsChanges.guildId, guildId))
    .orderBy(desc(settingsChanges.createdAt))
    .limit(limit);
}
