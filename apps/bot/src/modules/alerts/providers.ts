/**
 * What Twitch and YouTube say right now. Twitch needs an app's client ID and
 * secret (Helix, client-credentials token); YouTube uploads come from the public
 * channel feed, which needs no key. Every request has a timeout, and answers are
 * read defensively: a provider's text is data, never trusted markup.
 */

const TIMEOUT_MS = 8000;

export interface LiveStream {
  id: string;
  login: string;
  name: string;
  title: string;
  game: string;
  thumbnail: string;
  startedAt: Date;
}

export interface Video {
  id: string;
  title: string;
  author: string;
  published: Date;
}

// --- Twitch --------------------------------------------------------------------

let token: { value: string; expires: number } | null = null;

async function twitchToken(clientId: string, secret: string) {
  if (token && Date.now() < token.expires - 60_000) return token.value;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Twitch token: ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Twitch token: no access_token");
  token = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** Which of these logins are live, keyed by login. Up to 100 per request, as Helix allows. */
export async function twitchLive(
  keys: { clientId: string; secret: string },
  logins: string[],
): Promise<Map<string, LiveStream>> {
  const out = new Map<string, LiveStream>();
  for (let i = 0; i < logins.length; i += 100) {
    const batch = logins.slice(i, i + 100);
    const url = new URL("https://api.twitch.tv/helix/streams");
    for (const l of batch) url.searchParams.append("user_login", l);
    url.searchParams.set("first", "100");
    const res = await fetch(url, {
      headers: {
        "Client-Id": keys.clientId,
        Authorization: `Bearer ${await twitchToken(keys.clientId, keys.secret)}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) token = null; // Expired early: fetch a new one next time.
    if (!res.ok) throw new Error(`Twitch streams: ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    for (const s of body.data ?? []) {
      if (s.type !== "live" || typeof s.user_login !== "string" || typeof s.id !== "string")
        continue;
      out.set(s.user_login.toLowerCase(), {
        id: s.id,
        login: s.user_login.toLowerCase(),
        name: typeof s.user_name === "string" ? s.user_name : s.user_login,
        title: typeof s.title === "string" ? s.title.slice(0, 140) : "",
        game: typeof s.game_name === "string" && s.game_name ? s.game_name : "something",
        thumbnail:
          typeof s.thumbnail_url === "string"
            ? s.thumbnail_url.replace("{width}", "1280").replace("{height}", "720")
            : "",
        startedAt: new Date(typeof s.started_at === "string" ? s.started_at : Date.now()),
      });
    }
  }
  return out;
}

// --- YouTube ---------------------------------------------------------------------

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m?.[1] ? decode(m[1].trim()) : "";
};

/** The newest videos on a channel's public feed, newest first (YouTube keeps 15). */
export function parseYoutubeFeed(xml: string): Video[] {
  const author = tag(xml.split("<entry>")[0] ?? "", "name");
  return xml
    .split("<entry>")
    .slice(1)
    .flatMap((entry) => {
      const id = tag(entry, "yt:videoId");
      const published = new Date(tag(entry, "published"));
      if (!/^[A-Za-z0-9_-]{11}$/.test(id) || Number.isNaN(published.getTime())) return [];
      return [
        {
          id,
          title: tag(entry, "title").slice(0, 140),
          author: tag(entry, "name") || author,
          published,
        },
      ];
    });
}

export async function youtubeVideos(channelId: string): Promise<Video[] | null> {
  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`YouTube feed: ${res.status}`);
  return parseYoutubeFeed(await res.text());
}

/** A YouTube @handle's channel ID, read from the channel page. Null when there's no such channel. */
export async function resolveYoutubeHandle(handle: string): Promise<string | null> {
  const res = await fetch(`https://www.youtube.com/${encodeURIComponent(handle)}`, {
    headers: { "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`YouTube channel: ${res.status}`);
  const html = await res.text();
  const m =
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(
      html,
    ) ?? /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(html);
  return m?.[1] ?? null;
}

export const youtubeThumbnail = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

// --- Kick ------------------------------------------------------------------------

let kickToken: { value: string; expires: number } | null = null;

async function kickAppToken(clientId: string, secret: string) {
  if (kickToken && Date.now() < kickToken.expires - 60_000) return kickToken.value;
  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: secret,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Kick token: ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Kick token: no access_token");
  kickToken = {
    value: body.access_token,
    expires: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return kickToken.value;
}

/**
 * Which of these Kick channels are live, keyed by slug (Kick's public API, an app token; 50
 * slugs a request). A stream's ID is its start time: Kick gives streams no ID of their own.
 */
export async function kickLive(
  keys: { clientId: string; secret: string },
  slugs: string[],
): Promise<Map<string, LiveStream>> {
  const out = new Map<string, LiveStream>();
  for (let i = 0; i < slugs.length; i += 50) {
    const url = new URL("https://api.kick.com/public/v1/channels");
    for (const s of slugs.slice(i, i + 50)) url.searchParams.append("slug", s);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await kickAppToken(keys.clientId, keys.secret)}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) kickToken = null;
    if (!res.ok) throw new Error(`Kick channels: ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    for (const c of body.data ?? []) {
      const stream = (c.stream ?? {}) as Record<string, unknown>;
      if (stream.is_live !== true || typeof c.slug !== "string") continue;
      const started = typeof stream.start_time === "string" ? new Date(stream.start_time) : null;
      if (!started || Number.isNaN(started.getTime())) continue;
      const category = (c.category ?? {}) as Record<string, unknown>;
      const slug = c.slug.toLowerCase();
      out.set(slug, {
        id: `${slug}:${started.getTime()}`,
        login: slug,
        name: c.slug,
        title: typeof c.stream_title === "string" ? c.stream_title.slice(0, 140) : "",
        game: typeof category.name === "string" && category.name ? category.name : "something",
        thumbnail:
          typeof stream.thumbnail === "string" && /^https:\/\//.test(stream.thumbnail)
            ? stream.thumbnail
            : "",
        startedAt: started,
      });
    }
  }
  return out;
}

// --- Posts: Reddit, Bluesky, RSS -------------------------------------------------------

/** A new post from a feed: the same shape whichever site it came from. */
export interface Post {
  id: string;
  title: string;
  /** Who wrote it (Reddit: the poster; Bluesky: the account; RSS: the post's author). */
  author: string;
  url: string;
  thumbnail: string;
  published: Date;
}

const UA = "Garrison Discord bot (alerts)";
const MAX_BYTES = 2_000_000;

/** A response's text, refusing anything over MAX_BYTES. */
async function readCapped(res: Response): Promise<string> {
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("Feed too large");
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Feed too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const stripTags = (s: string) =>
  decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inner = (xml: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m?.[1]?.trim() ?? "";
};
const attr = (xml: string, name: string, key: string, where?: RegExp) => {
  for (const m of xml.matchAll(new RegExp(`<${name}\\s([^>]*)/?>`, "g"))) {
    const attrs = m[1] ?? "";
    if (where && !where.test(attrs)) continue;
    const v = new RegExp(`${key}="([^"]*)"`).exec(attrs)?.[1];
    if (v) return decode(v);
  }
  return "";
};

/** Items from an RSS 2.0 or Atom feed, newest first as the feed lists them. */
export function parseFeed(xml: string): { name: string; posts: Post[] } {
  const atom = /<feed[\s>]/.test(xml) && !/<rss[\s>]/.test(xml);
  const head = xml.split(atom ? /<entry[\s>]/ : /<item[\s>]/)[0] ?? "";
  const name = stripTags(inner(head, "title")).slice(0, 80);
  const blocks = xml.split(atom ? /<entry[\s>]/ : /<item[\s>]/).slice(1);
  const posts = blocks.flatMap((b) => {
    const title = stripTags(inner(b, "title")).slice(0, 200);
    const link = atom
      ? attr(b, "link", "href", /rel="alternate"/) || attr(b, "link", "href")
      : stripTags(inner(b, "link"));
    const id = stripTags(inner(b, atom ? "id" : "guid")) || link;
    const when = stripTags(
      inner(b, atom ? "published" : "pubDate") || inner(b, "updated") || inner(b, "dc:date"),
    );
    const published = new Date(when);
    const author = stripTags(
      inner(inner(b, "author"), "name") || inner(b, "author") || inner(b, "dc:creator"),
    );
    const thumbnail =
      attr(b, "media:thumbnail", "url") ||
      attr(b, "media:content", "url", /medium="image"|type="image/) ||
      attr(b, "enclosure", "url", /type="image/);
    if (!id || !title) return [];
    return [
      {
        id: id.slice(0, 300),
        title,
        author: author.slice(0, 80),
        url: /^https?:\/\//i.test(link) ? link : "",
        thumbnail: /^https:\/\//.test(thumbnail) ? thumbnail : "",
        published: Number.isNaN(published.getTime()) ? new Date(0) : published,
      },
    ];
  });
  return { name, posts };
}

let redditToken: { value: string; expires: number } | null = null;

async function redditAppToken(clientId: string, secret: string) {
  if (redditToken && Date.now() < redditToken.expires - 60_000) return redditToken.value;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "User-Agent": UA,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Reddit token: ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Reddit token: no access_token");
  redditToken = {
    value: body.access_token,
    expires: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return redditToken.value;
}

/** A subreddit listing's posts, newest first: no pinned or NSFW posts, links made whole. */
export function readRedditListing(body: unknown): Post[] {
  const children = (body as { data?: { children?: unknown[] } })?.data?.children ?? [];
  return children.flatMap((c) => {
    const d = ((c as { data?: unknown })?.data ?? {}) as Record<string, unknown>;
    if (d.stickied === true || d.over_18 === true) return [];
    if (typeof d.name !== "string" || typeof d.permalink !== "string") return [];
    const preview = (d.preview as { images?: { source?: { url?: unknown } }[] })?.images?.[0]
      ?.source?.url;
    const thumb =
      typeof preview === "string"
        ? decode(preview)
        : typeof d.thumbnail === "string"
          ? d.thumbnail
          : "";
    return [
      {
        id: d.name,
        title: typeof d.title === "string" ? decode(d.title).slice(0, 200) : "",
        author: typeof d.author === "string" ? `u/${d.author}` : "",
        url: `https://www.reddit.com${d.permalink}`,
        thumbnail: /^https:\/\//.test(thumb) ? thumb : "",
        published: new Date(typeof d.created_utc === "number" ? d.created_utc * 1000 : 0),
      },
    ];
  });
}

/**
 * Newest posts in a subreddit. Reddit refuses anonymous reads from servers (429s, and
 * redirects to its login), so this uses an app's own token (REDDIT_CLIENT_ID and
 * REDDIT_CLIENT_SECRET). Null when there's no such subreddit, or it's private or banned.
 */
export async function redditPosts(
  keys: { clientId: string; secret: string },
  subreddit: string,
): Promise<Post[] | null> {
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new?limit=15&raw_json=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${await redditAppToken(keys.clientId, keys.secret)}`,
      "User-Agent": UA,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) redditToken = null;
  // Missing answers 404 or redirects to a search; private and banned answer 403.
  if (res.status === 404 || res.status === 403 || (res.status >= 300 && res.status < 400))
    return null;
  if (!res.ok) throw new Error(`Reddit: ${res.status}`);
  return readRedditListing(JSON.parse(await readCapped(res)));
}

/** A Bluesky account's own posts (not reposts or replies), newest first. */
export async function blueskyPosts(actor: string): Promise<Post[] | null> {
  const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
  url.searchParams.set("actor", actor);
  url.searchParams.set("limit", "15");
  url.searchParams.set("filter", "posts_no_replies");
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 400) return null; // No such account.
  if (!res.ok) throw new Error(`Bluesky feed: ${res.status}`);
  const body = (await res.json()) as { feed?: Record<string, unknown>[] };
  return (body.feed ?? []).flatMap((item) => {
    if (item.reason) return []; // A repost.
    const post = (item.post ?? {}) as Record<string, unknown>;
    const author = (post.author ?? {}) as Record<string, unknown>;
    const record = (post.record ?? {}) as Record<string, unknown>;
    const uri = typeof post.uri === "string" ? post.uri : "";
    const rkey = uri.split("/").pop() ?? "";
    const handle = typeof author.handle === "string" ? author.handle : actor;
    if (!uri || !/^[a-z0-9]+$/i.test(rkey)) return [];
    const embed = (post.embed ?? {}) as Record<string, unknown>;
    const images = Array.isArray(embed.images) ? (embed.images as Record<string, unknown>[]) : [];
    const thumb = typeof images[0]?.thumb === "string" ? images[0].thumb : "";
    const published = new Date(typeof record.createdAt === "string" ? record.createdAt : 0);
    return [
      {
        id: uri,
        title: typeof record.text === "string" ? record.text.slice(0, 500) : "",
        author:
          typeof author.displayName === "string" && author.displayName
            ? author.displayName.slice(0, 80)
            : handle,
        url: `https://bsky.app/profile/${handle}/post/${rkey}`,
        thumbnail: /^https:\/\//.test(thumb) ? thumb : "",
        published: Number.isNaN(published.getTime()) ? new Date(0) : published,
      },
    ];
  });
}

/** Whether an address is private, loopback, link-local or otherwise not the public internet. */
export function privateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a = 0, b = 0] = v4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    /^f[cd]/.test(v6) ||
    /^fe[89ab]/.test(v6) ||
    v6.startsWith("ff") ||
    v6.startsWith("64:ff9b:")
  );
}

/**
 * A feed someone typed in, fetched only from the public internet: every hop's host is looked
 * up first and refused if it points inside a network, redirects are followed by hand (3 at
 * most), and answers over 2 MB are dropped. Null when the feed isn't there.
 */
export async function rssPosts(
  address: string,
  lookup: (host: string) => Promise<string[]>,
): Promise<{ name: string; posts: Post[] } | null> {
  let url = address;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Feed: not http");
    if (u.username || u.password) throw new Error("Feed: has a login");
    const addresses = await lookup(u.hostname);
    if (!addresses.length || addresses.some(privateAddress))
      throw new Error("Feed: host isn't public");
    const res = await fetch(u, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, */*" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      url = new URL(next, u).toString();
      continue;
    }
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`Feed: ${res.status}`);
    const parsed = parseFeed(await readCapped(res));
    return {
      name: parsed.name || u.hostname,
      posts: parsed.posts.map((p) => {
        let link = "";
        try {
          link = p.url ? new URL(p.url, u).toString() : "";
        } catch {}
        return { ...p, url: /^https?:\/\//.test(link) ? link : "" };
      }),
    };
  }
  throw new Error("Feed: too many redirects");
}
