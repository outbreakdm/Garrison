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
