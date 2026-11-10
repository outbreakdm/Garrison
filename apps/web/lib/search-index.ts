import { PAGES, type PageKey } from "./pages";

/**
 * What the dashboard search finds besides members and cases: every page and
 * every setting, with words people might type for them. Static and pure, so
 * it's unit tested and never touches the database.
 */
export interface SearchEntry {
  title: string;
  /** Where it lives, e.g. "Settings · Levels". */
  where: string;
  /** Path under /servers/:id. */
  path: string;
  keywords: string;
}

/** A page, findable by its title, by Garrison's name for it, and by `keywords`. */
const page = (key: PageKey, keywords: string): SearchEntry => {
  const p = PAGES[key];
  return {
    title: p.title,
    where: p.module ? `Page · ${p.module}` : "Page",
    path: p.path,
    keywords,
  };
};
/** Where each page's settings are edited: on that page, already open. */
const PANELS = {
  watch: { page: "watch", path: "/watch?edit=settings#settings" },
  "anti-raid": { page: "gatehouse", path: "/gatehouse?edit=anti-raid#anti-raid" },
  server: { page: "settings", path: "/settings#server" },
  ranks: { page: "ranks", path: "/ranks?edit=settings#settings" },
  ledger: { page: "ledger", path: "/ledger?edit=settings#settings" },
} as const satisfies Record<string, { page: PageKey; path: string }>;
const setting = (panel: keyof typeof PANELS, title: string, keywords: string): SearchEntry => {
  const p = PAGES[PANELS[panel].page];
  return {
    title,
    where: `Settings · ${p.title}`,
    path: PANELS[panel].path,
    // Garrison's own name for the page finds its settings too.
    keywords: `${keywords} ${p.module ?? ""}`.trim(),
  };
};

export const SEARCH_INDEX: SearchEntry[] = [
  page("overview", "home dashboard stats health activity attention setup"),
  page("watch", "cases warn timeout kick ban mod escalation ladder purge clear messages"),
  page("gatehouse", "lockdown raid nuke verify verification quarantine anti-raid anti-nuke"),
  page("ledger", "audit log logs events history joins leaves"),
  page("rally", "lfg looking for group raid ops events roster signups bench"),
  page("barracks", "roster linked accounts games members steam osrs wow battle.net"),
  page("ranks", "xp level leveling leaderboard rewards ranks"),
  page("quartermaster", "ai build builder channels roles plan undo"),
  page("settings", "configure history undo account theme sign out time zone"),
  {
    title: "LFG templates",
    where: `Page · ${PAGES.rally.title}`,
    path: "/rally/templates",
    keywords: "lfg wording game presets roles buttons customize rally",
  },
  setting("watch", "Log channel", "mod log cases channel"),
  setting("watch", "DM members when moderated", "direct message notify"),
  setting("watch", "How to appeal", "appeal text ban"),
  setting("anti-raid", "Anti-raid", "join rate raid lockdown"),
  setting("anti-raid", "Auto-unlock", "lockdown minutes"),
  setting("anti-raid", "Flag new accounts", "account age days alt"),
  setting("anti-raid", "Alert channel", "security alerts"),
  setting("server", "Time zone", "timezone raid events schedule ops server"),
  setting("ranks", "Give XP for messages", "leveling on off enable"),
  setting("ranks", "Level-up messages", "announce channel"),
  setting("ledger", "Event log channel", "logs channel events"),
  setting("ledger", "Keep events for", "retention days prune"),
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
