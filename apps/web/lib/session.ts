import "server-only";
import { getActiveGuild, getWebSession, touchWebSession } from "@garrison/db";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { canManageGuildNow } from "./discord";
import { isProduction } from "./env";
import { hashToken, isSnowflake } from "./security";

/** __Host- cookies must be Secure, Path=/ and have no Domain: they can't be set or read by subdomains. */
export const SESSION_COOKIE = isProduction() ? "__Host-garrison_session" : "garrison_session";
export const OAUTH_COOKIE = isProduction() ? "__Host-garrison_oauth" : "garrison_oauth";
export const SESSION_TTL_MS = 7 * 86_400_000;

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

/** The current session, or null. Validated against the database on every request. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const hash = hashToken(token);
  const session = await getWebSession(getDb(), hash);
  if (session && Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await touchWebSession(getDb(), hash).catch(() => {});
  }
  return session;
});

export async function requireSession(next = "/servers") {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/**
 * Can the current session manage this server right now? Checks the session,
 * the ID's shape, that Garrison is in the server, and the user's live
 * permissions there. Returns null on any failure. Server Actions call this
 * directly: they are public POST endpoints, so page checks don't cover them.
 */
export const checkGuildAccess = cache(async (guildId: string) => {
  const session = await getSession();
  if (!session || typeof guildId !== "string" || !isSnowflake(guildId)) return null;
  const guild = await getActiveGuild(getDb(), guildId);
  if (!guild) return null;
  if (!(await canManageGuildNow(guildId, session.userId))) return null;
  return { session, guild };
});

/**
 * The gate for every server page. Signed-out users go to login; everything
 * else that fails is a 404, so the dashboard never confirms which servers exist.
 */
export const requireGuildAccess = cache(async (guildId: string) => {
  await requireSession(`/servers/${isSnowflake(guildId) ? guildId : ""}`);
  const access = await checkGuildAccess(guildId);
  if (!access) notFound();
  return access;
});
