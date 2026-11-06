import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/discord";
import { pkcePair, randomToken, safeNext } from "@/lib/security";
import { cookieOptions, OAUTH_COOKIE } from "@/lib/session";

/** Start Discord login: a fresh state and PKCE verifier, kept in a 10-minute HttpOnly cookie. */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const state = randomToken();
  const { verifier, challenge } = pkcePair();
  const response = NextResponse.redirect(authorizeUrl(state, challenge));
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), cookieOptions(600));
  return response;
}
