import { eq } from "drizzle-orm";
import { type AutomodConfig, readAutomod } from "../automod";
import type { Db } from "../client";
import { automodSettings } from "../schema";

/** A server's automod rules, with defaults (off) when none are saved. */
export async function getAutomod(db: Db, guildId: string): Promise<AutomodConfig> {
  const [row] = await db.select().from(automodSettings).where(eq(automodSettings.guildId, guildId));
  return readAutomod(row ?? null);
}
