import "server-only";
import {
  type AccessArea,
  allows,
  atLeast,
  type DashboardRole,
  getActiveGuild,
  getDashboardAccess,
  getWebSession,
  type ResolvedAccess,
  resolveAccess,
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
/** "Build me a…" from the landing page, held while its writer signs in and picks a server. */
export const BUILD_COOKIE = isProduction() ? "__Host-garrison_build" : "garrison_build";
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
 * What this user may do on this server's dashboard right now: everything as a manager (Manage
 * Server, or the owner), else what their grants and access groups give them (src/access.ts
 * resolveAccess), else null. Asked of Discord live, membership included; fails closed. Throws
 * when Discord can't answer right now, so a rate limit never reads as "not yours".
 */
export const guildAccessFor = cache(
  async (
    guildId: string,
    userId: string,
  ): Promise<{ manager: true } | { manager: false; access: ResolvedAccess } | null> => {
    const member = await memberNow(guildId, userId);
    if (!member) return null;
    if (member.manage) return { manager: true };
    const { grants, groups } = await getDashboardAccess(await getDb(), guildId);
    const access = resolveAccess(grants, groups, userId, member.roleIds);
    return access ? { manager: false, access } : null;
  },
);

/**
 * The plain level for lists and labels: "manager", the Viewer or Editor grant, or "viewer" for
 * someone who only has access through a group (what they can open is still decided per area).
 */
export const dashboardRole = cache(
  async (guildId: string, userId: string): Promise<DashboardRole | null> => {
    const a = await guildAccessFor(guildId, userId);
    if (!a) return null;
    return a.manager ? "manager" : (a.access.level ?? "viewer");
  },
);

/**
 * May the current session do `need` on this server right now? Checks the session, the ID's
 * shape, that Garrison is in the server, and the user's live access there. Returns null when
 * any of that says no, and throws when Discord can't answer (never grants access either way).
 * Server Actions call this directly: they are public POST endpoints, so page checks don't cover
 * them. The default is "editor": a change needs at least an editor, so an action that forgets
 * to say what it needs is still closed to viewers.
 *
 * `area` is the dashboard section it belongs to: with it, a viewer needs View there and an
 * editor needs Edit (a Viewer or Editor grant covers every area; an access group, only its
 * own). Without it, only a Viewer or Editor grant counts, so access groups never reach
 * anything that doesn't say which area it is.
 */
export const checkGuildAccess = cache(
  async (guildId: string, need: DashboardRole = "editor", area?: AccessArea) => {
    if (typeof guildId !== "string" || !isSnowflake(guildId)) return null;
    // Independent reads, so neither waits for the other.
    const [session, guild] = await Promise.all([
      getSession(),
      getDb().then((db) => getActiveGuild(db, guildId)),
    ]);
    if (!session || !guild) return null;
    const a = await guildAccessFor(guildId, session.userId);
    if (!a) return null;
    if (!a.manager) {
      if (need === "manager") return null;
      const ok = area
        ? allows(a.access, area, need === "editor" ? "edit" : "view")
        : !!a.access.level && atLeast(a.access.level, need);
      if (!ok) return null;
    }
    const role: DashboardRole = a.manager ? "manager" : (a.access.level ?? "viewer");
    return { session, guild, role, access: a.manager ? null : a.access };
  },
);

/**
 * The gate for every server page: anyone with access to `area` (viewers included). Signed-out
 * users go to login; a "no" is a 404, so the dashboard never confirms which servers exist.
 * Discord not answering is an error instead, shown with "Try again" by error.tsx.
 */
export const requireGuildAccess = cache(async (guildId: string, area?: AccessArea) => {
  await requireSession(`/servers/${isSnowflake(guildId) ? guildId : ""}`);
  const access = await checkGuildAccess(guildId, "viewer", area);
  if (!access) notFound();
  return access;
});
