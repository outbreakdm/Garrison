import { NextResponse } from "next/server";
import { isWowFlavor, isWowRegion } from "@/lib/barracks";
import { battlenetAuthorizeUrl, battlenetConfigured } from "@/lib/battlenet";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/security";
import { cookieOptions, getSession, OAUTH_COOKIE } from "@/lib/session";

/** Start linking WoW characters. Signed-in members only; region and version decide which Blizzard API to ask. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login?next=/account", env().APP_URL), 303);
  const params = new URL(request.url).searchParams;
  const region = params.get("region");
  const flavor = params.get("flavor") ?? "retail";
  if (!battlenetConfigured() || !isWowRegion(region) || !isWowFlavor(flavor))
    return NextResponse.redirect(new URL("/account", env().APP_URL), 303);
  const state = randomToken();
  const response = NextResponse.redirect(battlenetAuthorizeUrl(state));
  response.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, region, flavor, purpose: "battlenet" }),
    cookieOptions(600),
  );
  return response;
}
