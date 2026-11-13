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
  page("/watch", "Moderation", null, "cases warn timeout kick ban mod escalation watch"),
  page("/gatehouse", "Security", null, "lockdown raid nuke verify quarantine gatehouse"),
  page("/ledger", "Logs", null, "audit log events history joins leaves ledger"),
  page("/rally", "Groups and raids", null, "lfg group raid ops roster signups rally"),
  page(
    "/barracks",
    "Game accounts",
    null,
    "roster linked accounts games steam osrs rs3 runescape wow barracks",
  ),
  page("/ranks", "Leveling", null, "xp level leaderboard rewards ranks"),
  page(
    "/insignia",
    "Role menus",
    null,
    "role menu reaction roles self assign buttons dropdown colours pings card insignia",
  ),
  page(
    "/herald",
    "Welcome",
    null,
    "welcome join leave goodbye greet dm autorole roles on join new members card herald",
  ),
  page(
    "/dispatch",
    "Messages",
    null,
    "message builder announcement embed card schedule post rules reminder repeat dispatch",
  ),
  page("/quartermaster", "AI builder", null, "ai build channels roles undo quartermaster"),
  page("/settings", "Settings", null, "configure history undo account theme sign out"),
  page(
    "/rally/templates",
    "LFG templates",
    "Groups and raids",
    "lfg wording game presets roles buttons customize",
  ),
  setting("watch", "Moderation", "Log channel", "mod log cases channel"),
  setting("watch", "Moderation", "DM members when moderated", "direct message notify"),
  setting("watch", "Moderation", "How to appeal", "appeal text ban"),
  setting("anti-raid", "Security", "Anti-raid", "join rate raid lockdown"),
  setting("anti-raid", "Security", "Auto-unlock", "lockdown minutes"),
  setting("anti-raid", "Security", "Flag new accounts", "account age days alt"),
  setting("anti-raid", "Security", "Alert channel", "security alerts"),
  setting("server", "Server", "Time zone", "timezone raid events schedule ops"),
  setting("ranks", "Ranks", "Give XP for messages", "leveling on off enable"),
  setting("ranks", "Ranks", "Level-up messages", "announce channel"),
  setting("ledger", "Logs", "Log channel", "logs channel events"),
  setting("ledger", "Logs", "Keep events for", "retention days prune"),
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
