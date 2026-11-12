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
/** Where each module's settings are edited: on that module's own page, already open. */
const PANELS: Record<string, string> = {
  watch: "/watch?edit=settings#settings",
  "anti-raid": "/gatehouse?edit=anti-raid#anti-raid",
  server: "/settings#server",
  ranks: "/ranks?edit=settings#settings",
  ledger: "/ledger?edit=settings#settings",
};
const setting = (panel: string, module: string, title: string, keywords: string): SearchEntry => ({
  title,
  where: `Settings · ${module}`,
  path: PANELS[panel] ?? "/settings",
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
    "roster linked accounts games steam osrs rs3 runescape wow",
  ),
  page("/ranks", modules.ranks.name, modules.ranks.plain, "xp level leaderboard rewards"),
  page(
    "/insignia",
    modules.insignia.name,
    modules.insignia.plain,
    "role menu reaction roles self assign buttons dropdown colours pings card",
  ),
  page(
    "/herald",
    modules.herald.name,
    modules.herald.plain,
    "welcome join leave goodbye greet dm autorole roles on join new members card",
  ),
  page(
    "/dispatch",
    modules.dispatch.name,
    modules.dispatch.plain,
    "message builder announcement embed card schedule post rules reminder repeat",
  ),
  page(
    "/quartermaster",
    modules.quartermaster.name,
    modules.quartermaster.plain,
    "ai build channels roles undo",
  ),
  page("/settings", "Settings", null, "configure history undo account theme sign out"),
  page(
    "/rally/templates",
    "LFG templates",
    "Rally",
    "lfg wording game presets roles buttons customize",
  ),
  setting("watch", "Watch", "Log channel", "mod log cases channel"),
  setting("watch", "Watch", "DM members when moderated", "direct message notify"),
  setting("watch", "Watch", "How to appeal", "appeal text ban"),
  setting("anti-raid", "Gatehouse", "Anti-raid", "join rate raid lockdown"),
  setting("anti-raid", "Gatehouse", "Auto-unlock", "lockdown minutes"),
  setting("anti-raid", "Gatehouse", "Flag new accounts", "account age days alt"),
  setting("anti-raid", "Gatehouse", "Alert channel", "security alerts"),
  setting("server", "Server", "Time zone", "timezone raid events schedule ops"),
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
