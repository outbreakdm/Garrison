import "server-only";
import { env } from "./env";

/**
 * Twitch subscriber roles (best bot item 10). A streamer connects once: their token reads who
 * subscribes now, and is then dropped; it is never stored. From then on Twitch tells Garrison
 * about new and ended subscriptions through EventSub webhooks, which Garrison sets up with its
 * own app token (allowed because the streamer granted channel:read:subscriptions).
 */

const TIMEOUT_MS = 8000;
const SCOPE = "channel:read:subscriptions";
/** Read at most this many pages of subscribers (100 each) when connecting. */
const MAX_PAGES = 50;

export const twitchConfigured = () => {
  const e = env();
  return Boolean(e.TWITCH_CLIENT_ID && e.TWITCH_CLIENT_SECRET && e.TWITCH_EVENTSUB_SECRET);
};

const redirectUri = () => `${env().APP_URL}/auth/twitch/callback`;
export const eventSubCallback = () => `${env().APP_URL}/api/twitch/eventsub`;

export function twitchAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env().TWITCH_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    state,
    force_verify: "true",
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = env();
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID ?? "",
      client_secret: TWITCH_CLIENT_SECRET ?? "",
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Twitch token: ${res.status}`);
  const out = (await res.json()) as { access_token?: string; scope?: string[] };
  if (!out.access_token) throw new Error("Twitch token: none");
  return out;
}

/** The streamer's token for this one connection, and whether they granted the scope. */
export async function twitchExchange(code: string) {
  const t = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
  });
  return { token: t.access_token as string, granted: (t.scope ?? []).includes(SCOPE) };
}

const appToken = async () =>
  (await tokenRequest({ grant_type: "client_credentials" })).access_token as string;

async function helix(token: string, path: string, init: RequestInit = {}) {
  return fetch(`https://api.twitch.tv/helix/${path}`, {
    ...init,
    headers: {
      "Client-Id": env().TWITCH_CLIENT_ID ?? "",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Who signed in: the streamer's Twitch ID and login. */
export async function twitchMe(token: string) {
  const res = await helix(token, "users");
  if (!res.ok) throw new Error(`Twitch users: ${res.status}`);
  const user = ((await res.json()) as { data?: { id?: unknown; login?: unknown }[] }).data?.[0];
  if (typeof user?.id !== "string" || typeof user.login !== "string")
    throw new Error("Twitch users: no user");
  return { id: user.id, login: user.login };
}

/** Everyone subscribed right now (not the streamer themself), up to 5,000. */
export async function twitchSubscriptions(token: string, broadcasterId: string) {
  const out: { userId: string; tier: string }[] = [];
  let after = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ broadcaster_id: broadcasterId, first: "100" });
    if (after) q.set("after", after);
    const res = await helix(token, `subscriptions?${q}`);
    if (!res.ok) throw new Error(`Twitch subscriptions: ${res.status}`);
    const body = (await res.json()) as {
      data?: { user_id?: unknown; tier?: unknown }[];
      pagination?: { cursor?: unknown };
    };
    for (const s of body.data ?? [])
      if (typeof s.user_id === "string" && s.user_id !== broadcasterId)
        out.push({ userId: s.user_id, tier: typeof s.tier === "string" ? s.tier : "1000" });
    after = typeof body.pagination?.cursor === "string" ? body.pagination.cursor : "";
    if (!after) break;
  }
  return out;
}

export const EVENT_TYPES = ["channel.subscribe", "channel.subscription.end"] as const;

/** Ask Twitch to tell Garrison about new and ended subscriptions. Already there is fine. */
export async function subscribeToTwitchEvents(broadcasterId: string) {
  const token = await appToken();
  for (const type of EVENT_TYPES) {
    const res = await helix(token, "eventsub/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        type,
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
        transport: {
          method: "webhook",
          callback: eventSubCallback(),
          secret: env().TWITCH_EVENTSUB_SECRET,
        },
      }),
    });
    if (!res.ok && res.status !== 409) throw new Error(`Twitch EventSub ${type}: ${res.status}`);
  }
}

/** Stop Twitch's webhooks for a streamer no server follows any more. Best effort. */
export async function unsubscribeTwitchEvents(broadcasterId: string) {
  const token = await appToken();
  const res = await helix(token, `eventsub/subscriptions?user_id=${broadcasterId}`);
  if (!res.ok) return;
  const body = (await res.json()) as {
    data?: {
      id?: unknown;
      condition?: { broadcaster_user_id?: unknown };
      transport?: { callback?: unknown };
    }[];
  };
  for (const s of body.data ?? [])
    if (
      typeof s.id === "string" &&
      s.condition?.broadcaster_user_id === broadcasterId &&
      s.transport?.callback === eventSubCallback()
    )
      await helix(token, `eventsub/subscriptions?id=${encodeURIComponent(s.id)}`, {
        method: "DELETE",
      }).catch(() => null);
}
