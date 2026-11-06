import { syncLinksFromSource } from "@garrison/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isWowRegion, linksFromWowProfile } from "@/lib/barracks";
import { battlenetConfigured, battlenetExchange, fetchWowProfile } from "@/lib/battlenet";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security";
import { getSession, OAUTH_COOKIE } from "@/lib/session";

function back(result: string) {
  const response = NextResponse.redirect(new URL(`/account?${result}`, env().APP_URL), 303);
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

/** Finish linking WoW characters. The Battle.net token is used once and never stored. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !battlenetConfigured()) return back("error=battlenet");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let saved: { state?: unknown; region?: unknown; purpose?: unknown } = {};
  try {
    saved = JSON.parse((await cookies()).get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    return back("error=state");
  }
  if (
    !code ||
    !state ||
    saved.purpose !== "battlenet" ||
    typeof saved.state !== "string" ||
    !safeEqual(state, saved.state) ||
    !isWowRegion(saved.region)
  ) {
    return back("error=state");
  }
  try {
    const token = await battlenetExchange(code);
    const links = linksFromWowProfile(await fetchWowProfile(token, saved.region), saved.region).map(
      (l) => ({
        ...l,
        userId: session.userId,
        source: "battlenet" as const,
      }),
    );
    await syncLinksFromSource(getDb(), session.userId, "battlenet", ["wow"], links);
    return back(`linked=wow&count=${links.length}`);
  } catch {
    return back("error=battlenet");
  }
}
