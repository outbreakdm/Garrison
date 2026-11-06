import { discordConnectionProviders } from "@garrison/brand";
import { createWebSession, listActiveGuilds, syncLinksFromSource } from "@garrison/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { linksFromConnections } from "@/lib/barracks";
import { getDb } from "@/lib/db";
import {
  exchangeCode,
  fetchMe,
  fetchMyConnections,
  fetchMyGuilds,
  revokeToken,
} from "@/lib/discord";
import { env } from "@/lib/env";
import { canManage } from "@/lib/permissions";
import { hashToken, randomToken, safeEqual, safeNext } from "@/lib/security";
import {
  cookieOptions,
  getSession,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/session";

function fail(reason: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${reason}`, env().APP_URL), 303);
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

/** Finish Discord login. The state must match, the token is used for two reads and then revoked. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return fail("denied");

  let saved: { state?: unknown; verifier?: unknown; next?: unknown; purpose?: unknown } = {};
  try {
    saved = JSON.parse((await cookies()).get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    return fail("state");
  }
  if (
    !code ||
    !state ||
    typeof saved.state !== "string" ||
    typeof saved.verifier !== "string" ||
    !safeEqual(state, saved.state)
  ) {
    return fail("state");
  }

  let token: string;
  try {
    token = (await exchangeCode(code, saved.verifier)).access_token;
  } catch {
    return fail("discord");
  }
  try {
    if (saved.purpose === "connections") {
      // Linking accounts: the Discord account that approved must be the one signed in.
      const [session, me] = await Promise.all([getSession(), fetchMe(token)]);
      if (!session || session.userId !== me.id) return fail("mismatch");
      const links = linksFromConnections(await fetchMyConnections(token)).map((l) => ({
        ...l,
        userId: me.id,
        source: "discord" as const,
      }));
      await syncLinksFromSource(getDb(), me.id, "discord", discordConnectionProviders, links);
      const response = NextResponse.redirect(
        new URL("/account?linked=discord", env().APP_URL),
        303,
      );
      response.cookies.delete(OAUTH_COOKIE);
      return response;
    }

    const [me, guilds] = await Promise.all([fetchMe(token), fetchMyGuilds(token)]);
    const manageable = guilds
      .filter((g) => g.owner || canManage(BigInt(g.permissions)))
      .map((g) => g.id);
    const withGarrison = (await listActiveGuilds(getDb(), manageable)).map((g) => g.id);

    const sessionToken = randomToken();
    await createWebSession(getDb(), {
      tokenHash: hashToken(sessionToken),
      userId: me.id,
      username: me.global_name || me.username,
      manageableGuildIds: withGarrison,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    const next = safeNext(typeof saved.next === "string" ? saved.next : null);
    const response = NextResponse.redirect(new URL(next, env().APP_URL), 303);
    response.cookies.set(SESSION_COOKIE, sessionToken, cookieOptions(SESSION_TTL_MS / 1000));
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  } catch {
    return fail("discord");
  } finally {
    await revokeToken(token);
  }
}
