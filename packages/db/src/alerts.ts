/**
 * Stream and video alerts (module "Beacon"): a feed watches one Twitch channel
 * (live) or YouTube channel (new videos) and posts a card in a Discord channel,
 * optionally pinging one role. Pure and shared (`@garrison/db/cards`).
 *
 * Free: 3 feeds, the standard alert. Pro: 25 feeds, your own message and colour.
 * Over the limit after a downgrade, the extra feeds pause; nothing is deleted.
 */

import { ACCENT, STANDARD_ACCENT } from "./cards";
import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";

export type AlertProvider = "twitch" | "youtube";

export interface AlertFeed {
  id: string;
  provider: AlertProvider;
  /** A Twitch login, or a YouTube channel ID (UC…) or @handle. */
  handle: string;
  channelId: string;
  /** One role to ping. Null: no ping. Never @everyone. */
  roleId: string | null;
  /** Pro: your own words, with {name} {title} {game} {url}. Null: the standard text. */
  message: string | null;
  /** Pro: the card's colour. Null: Garrison volt. */
  accent: string | null;
}

export const ALERT_LIMITS = { message: 400 } as const;
export const FEED_HARD_MAX = FEATURES["alerts.feeds"].pro;
export const ALERT_PROVIDERS: Record<
  AlertProvider,
  { label: string; verb: string; example: string }
> = {
  twitch: { label: "Twitch", verb: "goes live", example: "Twitch username, like shroud" },
  youtube: {
    label: "YouTube",
    verb: "posts a video",
    example: "YouTube @handle or channel link",
  },
};
/** What the standard alert says under its heading. */
export const DEFAULT_ALERT_TEXT: Record<AlertProvider, string> = {
  twitch: "**{title}**\nPlaying {game}",
  youtube: "**{title}**",
};

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;
const YT_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const YT_HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;

export const feedLimit = (ent: Entitlements) => ent["alerts.feeds"];
export const isFeedPaused = (index: number, ent: Entitlements) => index >= feedLimit(ent);

/**
 * What someone typed, as the handle Garrison watches: a Twitch login, or a YouTube
 * channel ID or @handle, from a bare name or a channel link. Null if it isn't one.
 */
export function normalizeHandle(provider: AlertProvider, raw: string): string | null {
  let s = raw.trim();
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const host = u.hostname.replace(/^(www|m)\./, "");
      const path = u.pathname.split("/").filter(Boolean);
      if (provider === "twitch" && host === "twitch.tv") s = path[0] ?? "";
      else if (provider === "youtube" && host === "youtube.com")
        s = path[0] === "channel" ? (path[1] ?? "") : (path[0] ?? "");
      else return null;
    }
  } catch {
    return null;
  }
  if (provider === "twitch") {
    const login = s.toLowerCase();
    return TWITCH_LOGIN.test(login) ? login : null;
  }
  if (YT_CHANNEL.test(s)) return s;
  const handle = s.startsWith("@") ? s : `@${s}`;
  return YT_HANDLE.test(handle) ? handle : null;
}

export function parseAlertFeed(raw: unknown, index = 0): Parsed<AlertFeed> {
  const where = `Alert ${index + 1}`;
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id))
    return { ok: false, error: `${where} has no valid ID.` };
  if (r.provider !== "twitch" && r.provider !== "youtube")
    return { ok: false, error: `${where}: pick Twitch or YouTube.` };
  const provider = r.provider;
  const handle = typeof r.handle === "string" ? normalizeHandle(provider, r.handle) : null;
  if (!handle)
    return {
      ok: false,
      error: `${where}: that isn't a ${ALERT_PROVIDERS[provider].example}.`,
    };
  if (typeof r.channelId !== "string" || !SNOWFLAKE.test(r.channelId))
    return { ok: false, error: `${where}: pick the channel alerts go to.` };
  let roleId: string | null = null;
  if (r.roleId) {
    if (typeof r.roleId !== "string" || !SNOWFLAKE.test(r.roleId))
      return { ok: false, error: `${where}: pick the role to ping from this server's list.` };
    roleId = r.roleId;
  }
  let message: string | null = null;
  if (typeof r.message === "string" && r.message.trim()) {
    message = r.message.trim().replace(/\r\n/g, "\n");
    if (message.length > ALERT_LIMITS.message)
      return { ok: false, error: `${where}: messages can be ${ALERT_LIMITS.message} characters.` };
  }
  let accent: string | null = null;
  if (r.accent) {
    const a = typeof r.accent === "string" ? r.accent.trim().toLowerCase() : "";
    if (!ACCENT.test(a)) return { ok: false, error: `${where}: pick the colour as #rrggbb.` };
    accent = a === STANDARD_ACCENT ? null : a;
  }
  return {
    ok: true,
    value: { id: r.id, provider, handle, channelId: r.channelId, roleId, message, accent },
  };
}

/** Pro parts of one feed on this plan, as labels. `before` is the same feed as saved. */
export function feedPlanProblems(feed: AlertFeed, ent: Entitlements, before?: AlertFeed | null) {
  if (ent["alerts.custom"]) return [];
  const out: string[] = [];
  if (feed.message && feed.message !== before?.message) out.push("Your own message");
  if (feed.accent && feed.accent !== before?.accent) out.push("Accent colour");
  return out;
}

/** Check a server's whole feed list against its plan; saved values pass (they pause on Free). */
export function checkAlertFeeds(
  raw: unknown,
  ent: Entitlements,
  before: AlertFeed[] = [],
): Parsed<AlertFeed[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Alerts must be a list." };
  if (raw.length > FEED_HARD_MAX)
    return { ok: false, error: `A server can have ${FEED_HARD_MAX} alerts at most.` };
  const limit = feedLimit(ent);
  if (raw.length > limit && raw.length > before.length)
    return {
      ok: false,
      error: `Free servers can have ${limit} alerts. Garrison Pro allows ${FEED_HARD_MAX}.`,
    };
  const out: AlertFeed[] = [];
  for (const [i, f] of raw.entries()) {
    const feed = parseAlertFeed(f, i);
    if (!feed.ok) return feed;
    if (out.some((x) => x.id === feed.value.id))
      return { ok: false, error: "Two alerts share an ID. Refresh and try again." };
    if (
      out.some(
        (x) =>
          x.provider === feed.value.provider &&
          x.handle.toLowerCase() === feed.value.handle.toLowerCase() &&
          x.channelId === feed.value.channelId,
      )
    )
      return { ok: false, error: `${feed.value.handle} already posts in that channel.` };
    const problems = feedPlanProblems(
      feed.value,
      ent,
      before.find((b) => b.id === feed.value.id),
    );
    if (problems[0]) return { ok: false, error: `${problems[0]} is part of Garrison Pro.` };
    out.push(feed.value);
  }
  return { ok: true, value: out };
}

export function readAlertFeeds(raw: unknown): AlertFeed[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f, i) => {
    const feed = parseAlertFeed(f, i);
    return feed.ok ? [feed.value] : [];
  });
}

/** The words and colour an alert uses on this plan: Pro values pause on Free. */
export function alertLook(feed: AlertFeed, ent: Entitlements) {
  const custom = ent["alerts.custom"];
  return {
    text: (custom && feed.message) || DEFAULT_ALERT_TEXT[feed.provider],
    accent: (custom && feed.accent) || STANDARD_ACCENT,
  };
}

/** Fill {name} {title} {game} {url}. `clean` makes each value safe for where it goes. */
export function fillAlert(
  template: string,
  values: { name: string; title: string; game: string; url: string },
  clean: (s: string) => string = (s) => s,
) {
  return template.replace(/\{(name|title|game|url)\}/g, (_, k: keyof typeof values) =>
    k === "url" ? values.url : clean(values[k]),
  );
}

/** The heading over an alert: "shroud is live on Twitch". */
export const alertHeading = (provider: AlertProvider, name: string) =>
  provider === "twitch" ? `${name} is live on Twitch` : `${name} posted a new video`;
