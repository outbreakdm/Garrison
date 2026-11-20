import {
  connectTwitchSubs,
  entitlements,
  getGuildPlan,
  replaceTwitchSubscribers,
} from "@garrison/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { isSnowflake, safeEqual } from "@/lib/security";
import { checkGuildAccess, getSession, OAUTH_COOKIE } from "@/lib/session";
import {
  subscribeToTwitchEvents,
  twitchConfigured,
  twitchExchange,
  twitchMe,
  twitchSubscriptions,
} from "@/lib/twitch";

function back(guildId: string, result: string) {
  const path = isSnowflake(guildId) ? `/servers/${guildId}/beacon?${result}#sub-roles` : "/servers";
  const response = NextResponse.redirect(new URL(path, env().APP_URL), 303);
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

/**
 * Finish connecting a Twitch channel: read who subscribes now with the streamer's token, ask
 * Twitch to send new and ended subscriptions from here on, and drop the token. It's never stored.
 */
export async function GET(request: Request) {
  let saved: { state?: unknown; guildId?: unknown; purpose?: unknown } = {};
  try {
    saved = JSON.parse((await cookies()).get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    return back("", "error=state");
  }
  const guildId = typeof saved.guildId === "string" ? saved.guildId : "";
  const session = await getSession();
  if (!session || !twitchConfigured()) return back(guildId, "twitch=error");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (
    !code ||
    !state ||
    saved.purpose !== "twitch-subs" ||
    typeof saved.state !== "string" ||
    !safeEqual(state, saved.state) ||
    !isSnowflake(guildId)
  )
    return back(guildId, "twitch=denied");
  // Access and the plan are checked again: the cookie only says what was asked for.
  if (!(await checkGuildAccess(guildId, "manager"))) return back("", "error=access");
  const db = await getDb();
  if (!entitlements(await getGuildPlan(db, guildId))["alerts.subRoles"])
    return back(guildId, "twitch=pro");
  try {
    const { token, granted } = await twitchExchange(code);
    if (!granted) return back(guildId, "twitch=denied");
    const me = await twitchMe(token);
    const subs = await twitchSubscriptions(token, me.id);
    await subscribeToTwitchEvents(me.id);
    await connectTwitchSubs(db, {
      guildId,
      broadcasterId: me.id,
      broadcasterLogin: me.login,
      connectedBy: session.userId,
    });
    await replaceTwitchSubscribers(db, me.id, subs);
    return back(guildId, `twitch=connected&subs=${subs.length}`);
  } catch {
    return back(guildId, "twitch=error");
  }
}
