import { eq, inArray } from "drizzle-orm";
import { type AutomodConfig, readAutomod } from "../automod";
import type { Db } from "../client";
import { type AutomodRule, automodRules, automodSettings } from "../schema";

/** A server's automod rules, with defaults (off) when none are saved. */
export async function getAutomod(db: Db, guildId: string): Promise<AutomodConfig> {
  const [row] = await db.select().from(automodSettings).where(eq(automodSettings.guildId, guildId));
  return readAutomod(row ?? null);
}

/** The Discord AutoMod rule Garrison keeps for a server's patterns, if any. */
export async function getAutomodRule(db: Db, guildId: string): Promise<AutomodRule | null> {
  const [row] = await db.select().from(automodRules).where(eq(automodRules.guildId, guildId));
  return row ?? null;
}

/**
 * Servers whose patterns may need sending to Discord: automod rows with patterns, and any
 * server with a rule that may need removing.
 */
export async function listPatternGuilds(db: Db, guildIds: string[]): Promise<string[]> {
  if (!guildIds.length) return [];
  const [withPatterns, withRule] = await Promise.all([
    db
      .select({ guildId: automodSettings.guildId, patterns: automodSettings.regexPatterns })
      .from(automodSettings)
      .where(inArray(automodSettings.guildId, guildIds)),
    db
      .select({ guildId: automodRules.guildId })
      .from(automodRules)
      .where(inArray(automodRules.guildId, guildIds)),
  ]);
  return [
    ...new Set([
      ...withPatterns.filter((r) => r.patterns.length > 0).map((r) => r.guildId),
      ...withRule.map((r) => r.guildId),
    ]),
  ];
}

/** Record what was sent to Discord and its answer. */
export async function saveAutomodRule(
  db: Db,
  row: { guildId: string; ruleId: string | null; sent: string; error: string | null },
) {
  const set = { ruleId: row.ruleId, sent: row.sent, error: row.error, syncedAt: new Date() };
  await db
    .insert(automodRules)
    .values({ guildId: row.guildId, ...set })
    .onConflictDoUpdate({ target: automodRules.guildId, set });
}

export async function removeAutomodRule(db: Db, guildId: string) {
  await db.delete(automodRules).where(eq(automodRules.guildId, guildId));
}
