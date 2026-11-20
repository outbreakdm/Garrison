import { LOL_TIERS } from "@garrison/db";

/**
 * Stats for accounts linked through Discord's verified connections (best bot item 8), read
 * with Garrison's own keys: Steam's Web API (STEAM_API_KEY, free from steamcommunity.com/dev)
 * and Riot's API (RIOT_API_KEY; a development key lasts a day, a live product needs Riot's
 * production approval). Every answer is read defensively; nothing here throws.
 */

const TIMEOUT_MS = 8000;

export type StatLookup =
  | { ok: true; details: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "private" | "unavailable" };

// --- Steam ---------------------------------------------------------------------------

/** A Steam account's level and how many games it owns (owned games need a public profile). */
export async function steamStats(
  key: string,
  steamId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StatLookup> {
  if (!/^\d{17}$/.test(steamId)) return { ok: false, reason: "not_found" };
  const call = async (path: string, extra = "") => {
    const res = await fetchImpl(
      `https://api.steampowered.com/${path}/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}${extra}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`Steam ${res.status}`);
    return ((await res.json()) as { response?: Record<string, unknown> }).response ?? {};
  };
  try {
    const level = await call("IPlayerService/GetSteamLevel");
    const owned = await call("IPlayerService/GetOwnedGames", "&include_played_free_games=1");
    const details: Record<string, unknown> = {};
    if (typeof level.player_level === "number") details.level = level.player_level;
    // A private profile answers with an empty response: no games count, not zero games.
    if (typeof owned.game_count === "number") details.games = owned.game_count;
    if (!Object.keys(details).length) return { ok: false, reason: "private" };
    return { ok: true, details };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// --- Riot: League of Legends ranked ------------------------------------------------------

/** A Riot ID as Discord's connection shows it: "Name#TAG". */
export function splitRiotId(text: string): { name: string; tag: string } | null {
  const at = text.lastIndexOf("#");
  if (at < 1) return null;
  const name = text.slice(0, at).trim();
  const tag = text.slice(at + 1).trim();
  if (!name || name.length > 16 || !/^[\p{L}\p{N}]{2,5}$/u.test(tag)) return null;
  return { name, tag };
}

/** Solo queue tier as a number, Iron 1 to Challenger 10. Null when unranked. */
export function soloTier(entries: unknown): { tier: number; text: string } | null {
  if (!Array.isArray(entries)) return null;
  const solo = entries.find(
    (e) => (e as { queueType?: unknown })?.queueType === "RANKED_SOLO_5x5",
  ) as { tier?: unknown; rank?: unknown; leaguePoints?: unknown } | undefined;
  if (!solo || typeof solo.tier !== "string") return null;
  const i = LOL_TIERS.findIndex((t) => t.toUpperCase() === solo.tier);
  if (i === -1) return null;
  const division = typeof solo.rank === "string" && i < 7 ? ` ${solo.rank}` : "";
  return { tier: i + 1, text: `${LOL_TIERS[i]}${division}` };
}

const PLATFORM = /^[a-z]{2,4}\d?$/;

/**
 * A Riot ID's League solo queue rank: the account (any routing cluster answers), its active
 * League region, then its ranked entries there. Unranked is a result, not a failure.
 */
export async function leagueStats(
  key: string,
  riotId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StatLookup> {
  const id = splitRiotId(riotId);
  if (!id) return { ok: false, reason: "not_found" };
  const get = async (url: string) => {
    const res = await fetchImpl(url, {
      headers: { "X-Riot-Token": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Riot ${res.status}`);
    return (await res.json()) as unknown;
  };
  try {
    const account = (await get(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(id.name)}/${encodeURIComponent(id.tag)}`,
    )) as { puuid?: unknown } | null;
    if (typeof account?.puuid !== "string") return { ok: false, reason: "not_found" };
    const puuid = account.puuid;
    const region = (await get(
      `https://americas.api.riotgames.com/riot/account/v1/region/by-game/lol/by-puuid/${puuid}`,
    )) as { region?: unknown } | null;
    const platform = typeof region?.region === "string" ? region.region.toLowerCase() : "";
    if (!PLATFORM.test(platform)) return { ok: true, details: { lolTier: 0 } };
    const entries = await get(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
    );
    const solo = soloTier(entries);
    return {
      ok: true,
      details: solo
        ? { lolTier: solo.tier, lolRank: solo.text, lolRegion: platform }
        : { lolTier: 0, lolRegion: platform },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
