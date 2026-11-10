/**
 * The dashboard's pages, named once. The menu, each page's title, the search
 * index and the Settings page all read from here, so a page is called the same
 * thing everywhere. Titles are plain words for what the page does; `module` is
 * Garrison's own name for it, which members see in Discord ("Watch · case #14"),
 * shown small beside the title so the two can be matched up.
 */
export interface PageInfo {
  /** Path under /servers/:id. */
  path: string;
  title: string;
  /** Garrison's name for the module, when it has one. */
  module: string | null;
}

export const PAGES = {
  overview: { path: "", title: "Overview", module: null },
  watch: { path: "/watch", title: "Moderation", module: "Watch" },
  gatehouse: { path: "/gatehouse", title: "Security", module: "Gatehouse" },
  ledger: { path: "/ledger", title: "Event log", module: "Ledger" },
  rally: { path: "/rally", title: "Groups and raids", module: "Rally" },
  barracks: { path: "/barracks", title: "Game accounts", module: "Barracks" },
  ranks: { path: "/ranks", title: "Levels", module: "Ranks" },
  quartermaster: { path: "/quartermaster", title: "Server builder", module: "Quartermaster" },
  settings: { path: "/settings", title: "Settings", module: null },
} as const satisfies Record<string, PageInfo>;

export type PageKey = keyof typeof PAGES;

/** The menu, top to bottom. Groups say what the pages under them are for. */
export const MENU: { label: string | null; pages: PageKey[] }[] = [
  { label: null, pages: ["overview"] },
  { label: "Safety", pages: ["watch", "gatehouse", "ledger"] },
  { label: "Community", pages: ["rally", "barracks", "ranks"] },
  { label: "Setup", pages: ["quartermaster", "settings"] },
];
