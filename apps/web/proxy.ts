import { type NextRequest, NextResponse } from "next/server";
import { hostRedirect } from "./lib/hosts";

/**
 * Routes the public site and dashboard hosts (lib/hosts.ts), then sets
 * security headers. Authorization lives in each page and route
 * (requireSession / requireGuildAccess), never here: a proxy-only auth check
 * is one bypass away from no auth at all.
 */
export function proxy(request: NextRequest) {
  // garrisonbot.com is the public site; dash.garrisonbot.com is the dashboard.
  const moved = hostRedirect(
    request.headers.get("host"),
    request.nextUrl.pathname,
    request.nextUrl.search,
    process.env.APP_URL,
  );
  if (moved) return NextResponse.redirect(moved, 308);

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https://cdn.discordapp.com",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://discord.com https://oauth.battle.net",
    // The website verify page's captcha (Cloudflare Turnstile) runs in a frame.
    ...(request.nextUrl.pathname.startsWith("/verify/")
      ? ["frame-src https://challenges.cloudflare.com"]
      : []),
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
