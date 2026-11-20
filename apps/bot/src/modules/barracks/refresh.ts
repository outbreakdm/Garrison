import { listLinksToRefresh, updateLinkDetails } from "@garrison/db";
import type { BotContext } from "../../commands/types.js";
import { leagueStats, steamStats } from "./game-stats.js";
import { fetchHiscores } from "./osrs.js";
import { fetchRs3Hiscores } from "./rs3.js";

const OSRS_REFRESH_MS = 6 * 3_600_000;
/** Steam and League ranks change slowly; their APIs are rate-limited per key. */
const VERIFIED_REFRESH_MS = 6 * 3_600_000;

export interface GameStatKeys {
  steam: string | null;
  riot: string | null;
}

/** Keep OSRS stats fresh: a few of the oldest links each sweep, never a burst. */
export async function refreshOsrs(ctx: BotContext, keys?: GameStatKeys) {
  const due = await listLinksToRefresh(ctx.db, "osrs", new Date(Date.now() - OSRS_REFRESH_MS), 5);
  for (const link of due) {
    const r = await fetchHiscores(link.displayName);
    if (r.ok) await updateLinkDetails(ctx.db, link.id, { ...r.stats });
  }
  const rs3 = await listLinksToRefresh(ctx.db, "rs3", new Date(Date.now() - OSRS_REFRESH_MS), 5);
  for (const link of rs3) {
    const r = await fetchRs3Hiscores(link.displayName);
    if (r.ok) await updateLinkDetails(ctx.db, link.id, { ...r.stats });
  }
  if (keys) await refreshVerified(ctx, keys);
}

/**
 * Steam and Riot accounts linked through Discord: a few each sweep. A lookup that fails keeps
 * the stats it had; an account Steam or Riot can't find, or a private profile, is marked so
 * its stats stop counting, and is tried again next round.
 */
export async function refreshVerified(ctx: BotContext, keys: GameStatKeys) {
  const before = new Date(Date.now() - VERIFIED_REFRESH_MS);
  if (keys.steam) {
    for (const link of await listLinksToRefresh(ctx.db, "steam", before, 5, { verified: true })) {
      const r = await steamStats(keys.steam, link.accountId);
      if (r.ok) await updateLinkDetails(ctx.db, link.id, r.details);
      // Didn't answer: keep what it had, and wait its turn again instead of retrying each minute.
      else
        await updateLinkDetails(
          ctx.db,
          link.id,
          r.reason === "unavailable" ? link.details : { unavailable: r.reason },
        );
    }
  }
  if (keys.riot) {
    for (const link of await listLinksToRefresh(ctx.db, "riotgames", before, 5, {
      verified: true,
    })) {
      const r = await leagueStats(keys.riot, link.displayName);
      if (r.ok) await updateLinkDetails(ctx.db, link.id, r.details);
      // Didn't answer: keep what it had, and wait its turn again instead of retrying each minute.
      else
        await updateLinkDetails(
          ctx.db,
          link.id,
          r.reason === "unavailable" ? link.details : { unavailable: r.reason },
        );
    }
  }
}
