import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { type InsightsShare, insightsShares } from "../schema";

/** 32 random bytes, base64url: 43 characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function newShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function getInsightsShare(db: Db, guildId: string): Promise<InsightsShare | null> {
  const [row] = await db.select().from(insightsShares).where(eq(insightsShares.guildId, guildId));
  return row ?? null;
}

/** The share a link opens, or null: a malformed token never reaches the database. */
export async function findInsightsShare(db: Db, token: string): Promise<InsightsShare | null> {
  if (!TOKEN.test(token)) return null;
  const [row] = await db.select().from(insightsShares).where(eq(insightsShares.token, token));
  return row ?? null;
}

/** Make the link, or replace it: the old address stops working at once. */
export async function makeInsightsShare(db: Db, guildId: string, createdBy: string) {
  const token = newShareToken();
  const values = { token, createdBy, createdAt: new Date() };
  const [row] = await db
    .insert(insightsShares)
    .values({ guildId, ...values })
    .onConflictDoUpdate({ target: insightsShares.guildId, set: values })
    .returning();
  if (!row) throw new Error("Share insert returned no row");
  return row;
}

export async function setInsightsShareEmbed(db: Db, guildId: string, embed: boolean) {
  await db.update(insightsShares).set({ embed }).where(eq(insightsShares.guildId, guildId));
}

export async function stopInsightsShare(db: Db, guildId: string) {
  await db.delete(insightsShares).where(eq(insightsShares.guildId, guildId));
}
