/**
 * Stream and video alerts (module "Beacon"): a feed watches one Twitch or Kick channel
 * (live), YouTube channel (new videos), subreddit, RSS or Atom feed, or Bluesky account
 * (new posts) and posts a card in a Discord channel, optionally pinging one role. Pure and
 * shared (`@garrison/db/cards`). Kick, Reddit, RSS and Bluesky since 2026-11-20 (best bot
 * item 7).
 *
 * Free: 3 feeds, the standard alert. Pro: 25 feeds, your own message and color.
 * Over the limit after a downgrade, the extra feeds pause; nothing is deleted.
 */

import { ACCENT, STANDARD_ACCENT } from "./cards";
import { type Language, say } from "./i18n";
import { PANEL_LIMITS, panelText, readPanelText } from "./panels";
import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";

export const ALERT_PROVIDER_LIST = [
  "twitch",
  "kick",
  "youtube",
  "reddit",
  "bluesky",
  "rss",
] as const;
export type AlertProvider = (typeof ALERT_PROVIDER_LIST)[number];
/** Providers that announce a live stream; the rest announce new posts. */
export const LIVE_PROVIDERS = new Set<AlertProvider>(["twitch", "kick"]);

export interface AlertFeed {
  id: string;
  provider: AlertProvider;
  /**
   * A Twitch login or Kick slug, a YouTube channel ID (UC…) or @handle, a subreddit's name,
   * a Bluesky handle or DID, or an RSS or Atom feed's address.
   */
  handle: string;
  channelId: string;
  /** One role to ping. Null: no ping. Never @everyone. */
  roleId: string | null;
  /** Pro: your own words, with {name} {title} {game} {url}. Null: the standard text. */
  message: string | null;
  /** Pro: the card's color. Null: Garrison volt. */
  accent: string | null;
}

export const ALERT_LIMITS = { message: 400 } as const;
export const FEED_HARD_MAX = FEATURES["alerts.feeds"].pro;
export const ALERT_PROVIDERS: Record<
  AlertProvider,
  { label: string; verb: string; example: string }
> = {
  twitch: { label: "Twitch", verb: "goes live", example: "Twitch username, like shroud" },
  kick: { label: "Kick", verb: "goes live", example: "Kick username, like xqc" },
  youtube: {
    label: "YouTube",
    verb: "posts a video",
    example: "YouTube @handle or channel link",
  },
  reddit: { label: "Reddit", verb: "gets a new post", example: "subreddit, like r/valorant" },
  bluesky: {
    label: "Bluesky",
    verb: "posts",
    example: "Bluesky handle, like name.bsky.social",
  },
  rss: { label: "RSS", verb: "has a new post", example: "feed address, starting https://" },
};
/** What the standard alert says under its heading. */
export const DEFAULT_ALERT_TEXT: Record<AlertProvider, string> = {
  twitch: "**{title}**\nPlaying {game}",
  kick: "**{title}**\nPlaying {game}",
  youtube: "**{title}**",
  reddit: "**{title}**\nPosted by {game}",
  bluesky: "{title}",
  rss: "**{title}**",
};

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;
const YT_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const YT_HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;
const KICK_SLUG = /^[a-z0-9_-]{3,25}$/;
const SUBREDDIT = /^[A-Za-z0-9_]{2,21}$/;
const BSKY_HANDLE = /^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{0,62}$/;
const BSKY_DID = /^did:plc:[a-z2-7]{24}$/;
export const FEED_URL_MAX = 500;

/**
 * Whether a feed address may be fetched at all: https or http, a public host name (no
 * addresses, localhost or internal names), no login in it. The bot checks where the name
 * points too, before every fetch.
 */
export function publicFeedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443" && u.port !== "80") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|intranet|corp)$/.test(host)) return null;
  u.hash = "";
  const out = u.toString();
  return out.length <= FEED_URL_MAX ? out : null;
}

export const feedLimit = (ent: Entitlements) => ent["alerts.feeds"];
export const isFeedPaused = (index: number, ent: Entitlements) => index >= feedLimit(ent);

/**
 * What someone typed, as the handle Garrison watches: a Twitch login, or a YouTube
 * channel ID or @handle, from a bare name or a channel link. Null if it isn't one.
 */
export function normalizeHandle(provider: AlertProvider, raw: string): string | null {
  let s = raw.trim();
  if (provider === "rss") return publicFeedUrl(s);
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const host = u.hostname.replace(/^(www|m|old|new)\./, "");
      const path = u.pathname.split("/").filter(Boolean);
      if (provider === "twitch" && host === "twitch.tv") s = path[0] ?? "";
      else if (provider === "kick" && host === "kick.com") s = path[0] ?? "";
      else if (provider === "youtube" && host === "youtube.com")
        s = path[0] === "channel" ? (path[1] ?? "") : (path[0] ?? "");
      else if (provider === "reddit" && host === "reddit.com" && path[0] === "r") s = path[1] ?? "";
      else if (provider === "bluesky" && host === "bsky.app" && path[0] === "profile")
        s = path[1] ?? "";
      else return null;
    }
  } catch {
    return null;
  }
  if (provider === "twitch") {
    const login = s.toLowerCase();
    return TWITCH_LOGIN.test(login) ? login : null;
  }
  if (provider === "kick") {
    const slug = s.toLowerCase();
    return KICK_SLUG.test(slug) ? slug : null;
  }
  if (provider === "reddit") {
    const name = s.replace(/^\/?r\//i, "");
    return SUBREDDIT.test(name) ? name : null;
  }
  if (provider === "bluesky") {
    const h = s.replace(/^@/, "").toLowerCase();
    return BSKY_DID.test(h) || BSKY_HANDLE.test(h) ? h : null;
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
  const provider = ALERT_PROVIDER_LIST.find((p) => p === r.provider);
  if (!provider)
    return { ok: false, error: `${where}: pick Twitch, Kick, YouTube, Reddit, Bluesky or RSS.` };
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
    if (!ACCENT.test(a)) return { ok: false, error: `${where}: pick the color as #rrggbb.` };
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
  if (feed.accent && feed.accent !== before?.accent) out.push("Accent color");
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

/** The words and color an alert uses on this plan: Pro values pause on Free. */
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

/** The heading over an alert, in the server's language: "shroud is live on Twitch". */
export function alertHeading(provider: AlertProvider, name: string, lang: Language = "en") {
  switch (provider) {
    case "twitch":
      return say(lang, "liveOn", { name, site: "Twitch" });
    case "kick":
      return say(lang, "liveOn", { name, site: "Kick" });
    case "youtube":
      return say(lang, "newVideo", { name });
    case "reddit":
      return say(lang, "newInSubreddit", { name });
    case "bluesky":
      return say(lang, "postedOn", { name, site: "Bluesky" });
    case "rss":
      return say(lang, "newFrom", { name });
  }
}

/** The link button under an alert, in the server's language. */
export function alertButton(provider: AlertProvider, lang: Language = "en") {
  switch (provider) {
    case "twitch":
      return say(lang, "watchOn", { site: "Twitch" });
    case "kick":
      return say(lang, "watchOn", { site: "Kick" });
    case "youtube":
      return say(lang, "watchOn", { site: "YouTube" });
    case "reddit":
      return say(lang, "openOn", { site: "Reddit" });
    case "bluesky":
      return say(lang, "openOn", { site: "Bluesky" });
    case "rss":
      return say(lang, "readIt");
  }
}

/** The link button under an alert. */
export const ALERT_BUTTON: Record<AlertProvider, string> = {
  twitch: "Watch on Twitch",
  kick: "Watch on Kick",
  youtube: "Watch on YouTube",
  reddit: "Open on Reddit",
  bluesky: "Open on Bluesky",
  rss: "Read it",
};

// --- Members asking for their stream ------------------------------------------------------------

/**
 * "Get your stream announced": a panel whose button opens a short form (the platform, their
 * channel, a note). Each request goes to staff as a card with Approve and Decline, and to the
 * Stream alerts page; approving adds the stream to the server's alerts, with the server's own
 * channel and ping, within the plan's alert limit. The member hears back by DM.
 */
export const STREAM_REQUEST_PROVIDERS = ["twitch", "kick", "youtube"] as const;
export type StreamRequestProvider = (typeof STREAM_REQUEST_PROVIDERS)[number];

export interface StreamRequestsConfig {
  /** Members may ask. Needs both channels. */
  requestsEnabled: boolean;
  /** Where requests go for staff. */
  requestReviewChannelId: string | null;
  /** Where an approved stream's alerts post. */
  requestAlertChannelId: string | null;
  /** The role an approved stream's alerts ping. Null: none. */
  requestRoleId: string | null;
  /** The panel's words; null is the standard (STREAM_PANEL). */
  requestPanelTitle: string | null;
  requestPanelBody: string | null;
  /** Where Garrison posted the panel. */
  requestPanelChannelId: string | null;
  requestPanelMessageId: string | null;
}

export const STREAM_PANEL = {
  title: "Get your stream announced",
  body: "Stream on Twitch, Kick or YouTube? Send your channel and staff add it to the server's stream alerts.",
  button: "Add my stream",
} as const;

export const STREAM_REQUEST_LIMITS = { note: 200 } as const;
/** Decided requests are kept this long, then deleted. */
export const STREAM_REQUESTS_DAYS = 90;

export function readStreamRequests(
  raw: Partial<Record<keyof StreamRequestsConfig, unknown>> | null | undefined,
): StreamRequestsConfig {
  const snowflake = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  return {
    requestsEnabled: raw?.requestsEnabled === true,
    requestReviewChannelId: snowflake(raw?.requestReviewChannelId),
    requestAlertChannelId: snowflake(raw?.requestAlertChannelId),
    requestRoleId: snowflake(raw?.requestRoleId),
    requestPanelTitle: readPanelText(raw?.requestPanelTitle, PANEL_LIMITS.title),
    requestPanelBody: readPanelText(raw?.requestPanelBody, PANEL_LIMITS.body),
    requestPanelChannelId: snowflake(raw?.requestPanelChannelId),
    requestPanelMessageId: snowflake(raw?.requestPanelMessageId),
  };
}

export type StreamRequestsSettings = Omit<
  StreamRequestsConfig,
  "requestPanelChannelId" | "requestPanelMessageId"
>;

/** Check a change to member requests. Channels and the role belonging to the server: the caller. */
export function checkStreamRequests(raw: Record<string, unknown>): Parsed<StreamRequestsSettings> {
  const id = (v: unknown, what: string): Parsed<string | null> => {
    if (v === null || v === undefined || v === "") return { ok: true, value: null };
    return typeof v === "string" && SNOWFLAKE.test(v)
      ? { ok: true, value: v }
      : { ok: false, error: `Pick ${what} from this server's list.` };
  };
  const review = id(raw.requestReviewChannelId, "the staff channel");
  if (!review.ok) return review;
  const alert = id(raw.requestAlertChannelId, "the alerts channel");
  if (!alert.ok) return alert;
  const role = id(raw.requestRoleId, "the role to ping");
  if (!role.ok) return role;
  const enabled = raw.requestsEnabled === true;
  if (enabled && !review.value)
    return { ok: false, error: "Pick the staff channel requests go to." };
  if (enabled && !alert.value)
    return { ok: false, error: "Pick the channel approved streams are announced in." };
  const title = panelText(
    raw.requestPanelTitle,
    PANEL_LIMITS.title,
    "The panel's title",
    STREAM_PANEL.title,
  );
  if (!title.ok) return title;
  const body = panelText(
    raw.requestPanelBody,
    PANEL_LIMITS.body,
    "The panel's text",
    STREAM_PANEL.body,
  );
  if (!body.ok) return body;
  return {
    ok: true,
    value: {
      requestsEnabled: enabled,
      requestReviewChannelId: review.value,
      requestAlertChannelId: alert.value,
      requestRoleId: role.value,
      requestPanelTitle: title.value,
      requestPanelBody: body.value,
    },
  };
}

/** The panel as members see it, with the standard words where the server wrote none. */
export const streamPanelWords = (
  c: Pick<StreamRequestsConfig, "requestPanelTitle" | "requestPanelBody">,
) => ({
  title: c.requestPanelTitle ?? STREAM_PANEL.title,
  body: c.requestPanelBody ?? STREAM_PANEL.body,
});

/**
 * What a member sent, checked: a platform members stream on, their channel as Garrison
 * watches it, and a short note. Null handle: it isn't one.
 */
export function checkStreamRequest(raw: {
  provider: unknown;
  handle: unknown;
  note?: unknown;
}): Parsed<{ provider: StreamRequestProvider; handle: string; note: string | null }> {
  const provider = STREAM_REQUEST_PROVIDERS.find((p) => p === raw.provider);
  if (!provider) return { ok: false, error: "Pick Twitch, Kick or YouTube." };
  const handle = typeof raw.handle === "string" ? normalizeHandle(provider, raw.handle) : null;
  if (!handle) return { ok: false, error: `That isn't a ${ALERT_PROVIDERS[provider].example}.` };
  const note = typeof raw.note === "string" ? raw.note.trim().replace(/\s+/g, " ") : "";
  if (note.length > STREAM_REQUEST_LIMITS.note)
    return { ok: false, error: `Keep the note under ${STREAM_REQUEST_LIMITS.note} characters.` };
  return { ok: true, value: { provider, handle, note: note || null } };
}

/** A stream's page, for staff to look before approving. */
export function streamUrl(provider: AlertProvider, handle: string): string | null {
  if (provider === "twitch") return `https://twitch.tv/${handle}`;
  if (provider === "kick") return `https://kick.com/${handle}`;
  if (provider === "youtube")
    return handle.startsWith("@")
      ? `https://youtube.com/${handle}`
      : `https://youtube.com/channel/${handle}`;
  return null;
}
