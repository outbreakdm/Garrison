import "server-only";
import type { WowRegion } from "./barracks";
import { env } from "./env";

/**
 * Battle.net sign-in for linking WoW characters. The token is used once to
 * read the character list and then dropped; it is never stored.
 */

export const battlenetConfigured = () => {
  const e = env();
  return Boolean(e.BNET_CLIENT_ID && e.BNET_CLIENT_SECRET);
};

const redirectUri = () => `${env().APP_URL}/auth/battlenet/callback`;

export function battlenetAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env().BNET_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "wow.profile",
    state,
  });
  return `https://oauth.battle.net/authorize?${params}`;
}

export async function battlenetExchange(code: string) {
  const { BNET_CLIENT_ID, BNET_CLIENT_SECRET } = env();
  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${BNET_CLIENT_ID}:${BNET_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Battle.net token exchange failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function fetchWowProfile(token: string, region: WowRegion) {
  const params = new URLSearchParams({ namespace: `profile-${region}`, locale: "en_US" });
  const res = await fetch(`https://${region}.api.blizzard.com/profile/user/wow?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return { wow_accounts: [] };
  if (!res.ok) throw new Error(`Battle.net profile request failed (${res.status})`);
  return (await res.json()) as unknown;
}
