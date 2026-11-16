import { NextResponse } from "next/server";
import { cleanPrompt, packPrompt, unpackPrompt } from "@/lib/build-prompt";
import { env } from "@/lib/env";
import { isSnowflake } from "@/lib/security";
import { BUILD_COOKIE, cookieOptions } from "@/lib/session";

/**
 * The landing page's "Build me a…" box. The description waits in a 30-minute cookie while
 * its writer signs in (sign-in only carries a bare path) and picks a server; picking one
 * hands it to that server's AI assistant, pre-filled and not yet sent.
 *
 *   /build?idea=…  hold it, then the server list (which asks to sign in first)
 *   /build?to=ID   take it to that server's AI assistant
 *   /build?clear=1 forget it
 *
 * Nothing here checks access: the AI assistant's page does, and a link only lands there.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const go = (path: string) => NextResponse.redirect(new URL(path, env().APP_URL), 303);
  const held = unpackPrompt(
    request.headers
      .get("cookie")
      ?.split(/;\s*/)
      .find((c) => c.startsWith(`${BUILD_COOKIE}=`))
      ?.slice(BUILD_COOKIE.length + 1),
  );

  const to = url.searchParams.get("to");
  if (to !== null) {
    if (!isSnowflake(to)) return go("/servers");
    const response = go(
      held
        ? `/servers/${to}/quartermaster?fresh=1&prompt=${encodeURIComponent(held)}#describe`
        : `/servers/${to}/quartermaster`,
    );
    response.cookies.set(BUILD_COOKIE, "", cookieOptions(0));
    return response;
  }

  const idea = cleanPrompt(url.searchParams.get("idea"));
  const response = go("/servers");
  if (idea && url.searchParams.get("clear") === null) {
    response.cookies.set(BUILD_COOKIE, packPrompt(idea), cookieOptions(1800));
  } else {
    response.cookies.set(BUILD_COOKIE, "", cookieOptions(0));
  }
  return response;
}
