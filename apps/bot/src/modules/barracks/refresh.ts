import { listLinksToRefresh, updateLinkDetails } from "@garrison/db";
import type { BotContext } from "../../commands/types.js";
import { fetchHiscores } from "./osrs.js";
import { fetchRs3Hiscores } from "./rs3.js";

const OSRS_REFRESH_MS = 6 * 3_600_000;

/** Keep OSRS stats fresh: a few of the oldest links each sweep, never a burst. */
export async function refreshOsrs(ctx: BotContext) {
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
}
