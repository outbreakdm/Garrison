/**
 * Two addresses, one app: the public site at garrisonbot.com and the
 * dashboard at dash.garrisonbot.com (APP_URL). Pure, so it's unit tested.
 *
 * Sign-in and its cookie live only on the dashboard host, so dashboard paths
 * on the public site are sent there rather than served.
 */

/** Paths the public site serves itself. Everything else belongs to the dashboard. */
const PUBLIC_PATHS = new Set([
  "/",
  "/status",
  "/healthz",
  "/icon.svg",
  "/favicon.ico",
  "/robots.txt",
]);

export interface Hosts {
  /** e.g. dash.garrisonbot.com */
  dashboard: string;
  /** e.g. garrisonbot.com, or null when the dashboard isn't on a dash. subdomain (local dev, tests). */
  site: string | null;
}

export function hostsFor(appUrl: string | undefined): Hosts | null {
  if (!appUrl) return null;
  let dashboard: string;
  try {
    dashboard = new URL(appUrl).host.toLowerCase();
  } catch {
    return null;
  }
  const site = dashboard.startsWith("dash.") ? dashboard.slice(5) : null;
  return { dashboard, site };
}

/** The public site's base URL, or "" to stay on the current host. */
export function siteUrl(appUrl: string | undefined) {
  const h = hostsFor(appUrl);
  return h?.site ? `https://${h.site}` : "";
}

/** Where a request should go instead, or null to serve it here. */
export function hostRedirect(
  host: string | null,
  pathname: string,
  search: string,
  appUrl: string | undefined,
): string | null {
  const hosts = hostsFor(appUrl);
  if (!hosts?.site || !host) return null;
  const h = host.toLowerCase();
  if (h === `www.${hosts.site}`) return `https://${hosts.site}${pathname}${search}`;
  if (h === hosts.site) {
    if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/_next/")) return null;
    return `https://${hosts.dashboard}${pathname}${search}`;
  }
  if (h === hosts.dashboard && pathname === "/") return `https://${hosts.dashboard}/servers`;
  return null;
}
