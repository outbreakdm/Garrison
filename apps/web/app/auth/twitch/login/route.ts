import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isSnowflake, randomToken } from "@/lib/security";
import { checkGuildAccess, cookieOptions, getSession, OAUTH_COOKIE } from "@/lib/session";
import { twitchAuthorizeUrl, twitchConfigured } from "@/lib/twitch";

/** A server's manager connects their Twitch channel for subscriber roles. */
export async function GET(request: Request) {
  const guildId = new URL(request.url).searchParams.get("guild") ?? "";
  const session = await getSession();
  if (!session)
    return NextResponse.redirect(
      new URL(`/login?next=/servers/${guildId}/beacon`, env().APP_URL),
      303,
    );
  if (!isSnowflake(guildId) || !twitchConfigured() || !(await checkGuildAccess(guildId, "manager")))
    return NextResponse.redirect(new URL("/servers", env().APP_URL), 303);
  const state = randomToken();
  const response = NextResponse.redirect(twitchAuthorizeUrl(state));
  response.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, guildId, purpose: "twitch-subs" }),
    cookieOptions(600),
  );
  return response;
}
