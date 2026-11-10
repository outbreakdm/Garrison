import { eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  dashboardSettings,
  gatehouseSettings,
  lfgPosts,
  opsEvents,
  rallySettings,
  ranksSettings,
  watchSettings,
} from "../schema";

/** What the overview's setup checklist is worked out from. Read-only: creates no rows. */
export interface SetupFacts {
  logChannelId: string | null;
  antiRaidEnabled: boolean;
  /** Where raid alerts go; null falls back to the log channel. */
  alertChannelId: string | null;
  verifyRoleId: string | null;
  /** Someone has saved Ranks settings, on or off: the row only exists after a save. */
  ranksDecided: boolean;
  ranksEnabled: boolean;
  /** A raid or a group was ever posted, or an LFG template exists. */
  rallyUsed: boolean;
  setupDismissed: boolean;
}

const exists = (db: Db, table: typeof opsEvents | typeof lfgPosts, guildId: string) =>
  db
    .select({ one: sql<number>`1` })
    .from(table)
    .where(eq(table.guildId, guildId))
    .limit(1)
    .then((rows) => rows.length > 0);

export async function getSetupFacts(db: Db, guildId: string): Promise<SetupFacts> {
  const [[watch], [gate], [ranks], raids, groups, [rally], [dash]] = await Promise.all([
    db
      .select({ logChannelId: watchSettings.logChannelId })
      .from(watchSettings)
      .where(eq(watchSettings.guildId, guildId)),
    db
      .select({
        antiRaidEnabled: gatehouseSettings.antiRaidEnabled,
        alertChannelId: gatehouseSettings.alertChannelId,
        verifyRoleId: gatehouseSettings.verifyRoleId,
      })
      .from(gatehouseSettings)
      .where(eq(gatehouseSettings.guildId, guildId)),
    db
      .select({ enabled: ranksSettings.enabled })
      .from(ranksSettings)
      .where(eq(ranksSettings.guildId, guildId)),
    exists(db, opsEvents, guildId),
    exists(db, lfgPosts, guildId),
    db
      .select({ n: sql<number>`jsonb_array_length(${rallySettings.templates})::int` })
      .from(rallySettings)
      .where(eq(rallySettings.guildId, guildId)),
    db
      .select({ setupDismissed: dashboardSettings.setupDismissed })
      .from(dashboardSettings)
      .where(eq(dashboardSettings.guildId, guildId)),
  ]);
  return {
    logChannelId: watch?.logChannelId ?? null,
    // The bot creates this row when it joins, with anti-raid on.
    antiRaidEnabled: gate?.antiRaidEnabled ?? true,
    alertChannelId: gate?.alertChannelId ?? null,
    verifyRoleId: gate?.verifyRoleId ?? null,
    ranksDecided: Boolean(ranks),
    ranksEnabled: ranks?.enabled ?? false,
    rallyUsed: raids || groups || (rally?.n ?? 0) > 0,
    setupDismissed: dash?.setupDismissed ?? false,
  };
}
