import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/discord";
import { env } from "@/lib/env";
import { pkcePair, randomToken, safeNext } from "@/lib/security";
import { cookieOptions, getSession, OAUTH_COOKIE } from "@/lib/session";

/** Start Discord login: a fresh state and PKCE verifier, kept in a 10-minute HttpOnly cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // purpose=connections links game accounts; it asks Discord for `connections` and only works when signed in.
  const purpose = url.searchParams.get("purpose") === "connections" ? "connections" : "login";
  if (purpose === "connections" && !(await getSession())) {
    return NextResponse.redirect(new URL("/login?next=/account", env().APP_URL), 303);
  }
  const next = purpose === "connections" ? "/account" : safeNext(url.searchParams.get("next"));
  const state = randomToken();
  const { verifier, challenge } = pkcePair();
  const scope = purpose === "connections" ? "identify connections" : undefined;
  const response = NextResponse.redirect(authorizeUrl(state, challenge, scope));
  response.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, verifier, next, purpose }),
    cookieOptions(600),
  );
  return response;
}
