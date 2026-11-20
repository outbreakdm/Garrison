import { describe, expect, it } from "vitest";
import { plainLink } from "./format.js";
import { leagueStats, soloTier, splitRiotId, steamStats } from "./game-stats.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch that answers by the URL's path, and records what was asked. */
function fake(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const impl = (async (url: string | URL) => {
    const u = String(url);
    asked.push(u);
    const hit = Object.keys(routes).find((k) => u.includes(k));
    return hit ? routes[hit]?.() : new Response("", { status: 404 });
  }) as typeof fetch;
  return { impl, asked };
}

describe("game stats", () => {
  it("reads a Steam level and games count, and a private profile as private", async () => {
    const open = fake({
      GetSteamLevel: () => json({ response: { player_level: 42 } }),
      GetOwnedGames: () => json({ response: { game_count: 310, games: [] } }),
    });
    expect(await steamStats("k", "76561197960287930", open.impl)).toEqual({
      ok: true,
      details: { level: 42, games: 310 },
    });
    const hidden = fake({
      GetSteamLevel: () => json({ response: {} }),
      GetOwnedGames: () => json({ response: {} }),
    });
    expect(await steamStats("k", "76561197960287930", hidden.impl)).toEqual({
      ok: false,
      reason: "private",
    });
    expect(await steamStats("k", "nope", open.impl)).toEqual({ ok: false, reason: "not_found" });
  });

  it("finds a Riot ID's League region and solo queue tier", async () => {
    const riot = fake({
      "by-riot-id/Ana/EUW": () => json({ puuid: "P1" }),
      "region/by-game/lol/by-puuid/P1": () => json({ puuid: "P1", game: "lol", region: "euw1" }),
      "euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/P1": () =>
        json([
          { queueType: "RANKED_FLEX_SR", tier: "DIAMOND", rank: "I" },
          { queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: 40 },
        ]),
    });
    expect(await leagueStats("k", "Ana#EUW", riot.impl)).toEqual({
      ok: true,
      details: { lolTier: 4, lolRank: "Gold II", lolRegion: "euw1" },
    });
    expect(riot.asked.every((u) => u.startsWith("https://"))).toBe(true);
    const missing = fake({});
    expect(await leagueStats("k", "Nobody#NA1", missing.impl)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("reads tiers and Riot IDs carefully", () => {
    expect(soloTier([{ queueType: "RANKED_SOLO_5x5", tier: "CHALLENGER", rank: "I" }])).toEqual({
      tier: 10,
      text: "Challenger",
    });
    expect(soloTier([])).toBeNull();
    expect(splitRiotId("Ana#EUW")).toEqual({ name: "Ana", tag: "EUW" });
    expect(splitRiotId("Ana")).toBeNull();
    expect(splitRiotId("#EUW")).toBeNull();
  });

  it("shows Steam and League stats on the roster", () => {
    expect(
      plainLink({
        provider: "steam",
        displayName: "ana",
        verified: true,
        details: { level: 42, games: 1310 },
      }),
    ).toBe("Steam · ana · level 42 · 1,310 games · verified");
    expect(
      plainLink({
        provider: "riotgames",
        displayName: "Ana#EUW",
        verified: true,
        details: { lolRank: "Gold II" },
      }),
    ).toBe("Riot Games · Ana#EUW · League Gold II · verified");
  });
});
