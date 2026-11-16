import { type NextRequest, NextResponse } from "next/server";
import { hostRedirect, hostsFor } from "./lib/hosts";

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
  // The public site's "Build me a…" box posts to the dashboard host (APP_URL).
  const hosts = hostsFor(process.env.APP_URL);
  const dashboardOrigin = hosts?.site ? ` https://${hosts.dashboard}` : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https://cdn.discordapp.com",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Upgrading and managing a plan hand off to Stripe's hosted pages. Battle.net's
    // authorize page redirects to its sign-in page on other battle.net and blizzard.com
    // hosts, and browsers check every step of a form's redirects against this list.
    `form-action 'self'${dashboardOrigin} https://discord.com https://*.battle.net https://*.blizzard.com https://checkout.stripe.com https://billing.stripe.com`,
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
