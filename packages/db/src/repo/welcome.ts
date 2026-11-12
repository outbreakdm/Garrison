import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { welcomeSettings } from "../schema";
import { readWelcome, type WelcomeConfig } from "../welcome";

/** A server's welcome settings, with defaults for anything not set. */
export async function getWelcome(db: Db, guildId: string): Promise<WelcomeConfig> {
  const [row] = await db.select().from(welcomeSettings).where(eq(welcomeSettings.guildId, guildId));
  return readWelcome(row ?? null);
}
