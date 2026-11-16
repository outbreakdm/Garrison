import "server-only";
import {
  atLeast,
  type DashboardRole,
  getAccessGrants,
  getActiveGuild,
  getWebSession,
  grantedLevel,
  touchWebSession,
} from "@garrison/db";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { getDb } from "./db";
import { memberNow } from "./discord";
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
  const session = await getWebSession(await getDb(), hash);
  if (session && Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    // After the response: the page shouldn't wait on a "last seen" write.
    after(async () => {
      await touchWebSession(await getDb(), hash).catch(() => {});
    });
  }
  return session;
});

export async function requireSession(next = "/servers") {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}

/**
 * What this user may do on this server's dashboard right now: "manager" with Manage Server
 * (or as owner), else the level a manager gave them or one of their roles (viewer or
 * editor), else null. Asked of Discord live, membership included; fails closed.
 */
export const dashboardRole = cache(
  async (guildId: string, userId: string): Promise<DashboardRole | null> => {
    const member = await memberNow(guildId, userId);
    if (!member) return null;
    if (member.manage) return "manager";
    return grantedLevel(await getAccessGrants(await getDb(), guildId), userId, member.roleIds);
  },
);

/**
 * May the current session do `need` on this server right now? Checks the session, the ID's
 * shape, that Garrison is in the server, and the user's live role there. Returns null on any
 * failure. Server Actions call this directly: they are public POST endpoints, so page checks
 * don't cover them. The default is "editor": a change needs at least an editor, so an action
 * that forgets to say what it needs is still closed to viewers.
 */
export const checkGuildAccess = cache(async (guildId: string, need: DashboardRole = "editor") => {
  if (typeof guildId !== "string" || !isSnowflake(guildId)) return null;
  // Independent reads, so neither waits for the other.
  const [session, guild] = await Promise.all([
    getSession(),
    getDb().then((db) => getActiveGuild(db, guildId)),
  ]);
  if (!session || !guild) return null;
  const role = await dashboardRole(guildId, session.userId);
  if (!role || !atLeast(role, need)) return null;
  return { session, guild, role };
});

/**
 * The gate for every server page: anyone with access, viewers included. Signed-out users go
 * to login; everything else that fails is a 404, so the dashboard never confirms which
 * servers exist.
 */
export const requireGuildAccess = cache(async (guildId: string) => {
  await requireSession(`/servers/${isSnowflake(guildId) ? guildId : ""}`);
  const access = await checkGuildAccess(guildId, "viewer");
  if (!access) notFound();
  return access;
});
