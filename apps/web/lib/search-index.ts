import { modules } from "@garrison/brand";

/**
 * What the dashboard search finds besides members and cases: every page and
 * every setting, with words people might type for them. Static and pure, so
 * it's unit tested and never touches the database.
 */
export interface SearchEntry {
  title: string;
  /** Where it lives, e.g. "Settings · Ranks". */
  where: string;
  /** Path under /servers/:id. */
  path: string;
  keywords: string;
}

const page = (
  path: string,
  title: string,
  plain: string | null,
  keywords: string,
): SearchEntry => ({
  title,
  where: plain ? `Page · ${plain}` : "Page",
  path,
  keywords,
});
const setting = (anchor: string, module: string, title: string, keywords: string): SearchEntry => ({
  title,
  where: `Settings · ${module}`,
  path: `/settings#${anchor}`,
  keywords,
});

export const SEARCH_INDEX: SearchEntry[] = [
  page("", "Overview", null, "home dashboard stats health activity"),
  page(
    "/watch",
    modules.watch.name,
    modules.watch.plain,
    "cases warn timeout kick ban mod escalation",
  ),
  page(
    "/gatehouse",
    modules.gatehouse.name,
    modules.gatehouse.plain,
    "lockdown raid nuke verify quarantine",
  ),
  page(
    "/ledger",
    modules.ledger.name,
    modules.ledger.plain,
    "audit log events history joins leaves",
  ),
  page("/rally", modules.rally.name, "LFG and events", "lfg group raid ops roster signups"),
  page(
    "/barracks",
    modules.barracks.name,
    modules.barracks.plain,
    "roster linked accounts games steam osrs wow",
  ),
  page("/ranks", modules.ranks.name, modules.ranks.plain, "xp level leaderboard rewards"),
  page(
    "/quartermaster",
    modules.quartermaster.name,
    modules.quartermaster.plain,
    "ai build channels roles undo",
  ),
  page("/settings", "Settings", null, "configure history undo"),
  setting("watch", "Watch", "Log channel", "mod log cases channel"),
  setting("watch", "Watch", "DM members when moderated", "direct message notify"),
  setting("watch", "Watch", "How to appeal", "appeal text ban"),
  setting("gatehouse", "Gatehouse", "Anti-raid", "join rate raid lockdown"),
  setting("gatehouse", "Gatehouse", "Auto-unlock", "lockdown minutes"),
  setting("gatehouse", "Gatehouse", "Flag new accounts", "account age days alt"),
  setting("gatehouse", "Gatehouse", "Alert channel", "security alerts"),
  setting("ops", "Ops", "Raid time zone", "timezone events schedule"),
  setting("ranks", "Ranks", "Give XP for messages", "leveling on off enable"),
  setting("ranks", "Ranks", "Level-up messages", "announce channel"),
  setting("ledger", "Ledger", "Ledger channel", "logs channel events"),
  setting("ledger", "Ledger", "Keep events for", "retention days prune"),
];

/** Every word of the query must appear in the title, place or keywords. */
export function searchIndex(q: string, entries = SEARCH_INDEX) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.filter((e) => {
    const hay = `${e.title} ${e.where} ${e.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
