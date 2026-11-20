"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LinkPending } from "./LinkPending";
import { NavIcon, type NavIconName } from "./NavIcon";

type NavItem = {
  id: "volt" | "cobalt" | "orchid" | "steel";
  href: string;
  name: string;
  icon: NavIconName;
  /** Only in the phone menu: the rail has the plan card at its foot. */
  sheetOnly?: boolean;
};

/**
 * Plain names first: the address keeps each module's original path. The groups follow what
 * an owner sets out to do (docs/LAYOUT_PROPOSAL.md §6): keep it safe, look after members, keep
 * them talking, post things, help people, play. Settings and Plan sit at the foot, where
 * people look for them. Each page keeps its color identity (Safety cobalt, people pages
 * orchid, Gaming volt, the server's own pages steel), which colors the whole page (app.css);
 * the group name is the tag beside each page's title (app.css, "data-section").
 */
const GROUPS: { name: string; foot?: boolean; items: NavItem[] }[] = [
  {
    name: "",
    items: [
      { id: "volt", href: "", name: "Overview", icon: "overview" },
      { id: "steel", href: "/quartermaster", name: "AI assistant", icon: "ai" },
      { id: "steel", href: "/insights", name: "Insights", icon: "insights" },
    ],
  },
  {
    name: "Safety",
    items: [
      { id: "cobalt", href: "/watch", name: "Moderation", icon: "moderation" },
      { id: "cobalt", href: "/gatehouse", name: "Security", icon: "security" },
      { id: "cobalt", href: "/ledger", name: "Logs", icon: "logs" },
    ],
  },
  {
    name: "Members",
    items: [
      { id: "orchid", href: "/herald", name: "Welcome", icon: "welcome" },
      { id: "orchid", href: "/insignia", name: "Role menus", icon: "roles" },
      { id: "orchid", href: "/invites", name: "Invites", icon: "invites" },
      { id: "orchid", href: "/barracks", name: "Game accounts", icon: "accounts" },
      { id: "orchid", href: "/utilities", name: "Utilities", icon: "utilities" },
    ],
  },
  {
    name: "Engagement",
    items: [
      { id: "orchid", href: "/ranks", name: "Leveling", icon: "leveling" },
      { id: "orchid", href: "/economy", name: "Economy", icon: "economy" },
      { id: "orchid", href: "/spoils", name: "Giveaways", icon: "giveaways" },
      { id: "orchid", href: "/honors", name: "Starboard", icon: "starboard" },
      { id: "orchid", href: "/suggestions", name: "Suggestions", icon: "suggestions" },
      { id: "orchid", href: "/fun", name: "Fun", icon: "fun" },
    ],
  },
  {
    name: "Posts",
    items: [
      { id: "orchid", href: "/dispatch", name: "Messages", icon: "messages" },
      { id: "orchid", href: "/beacon", name: "Stream alerts", icon: "alerts" },
      { id: "orchid", href: "/stats", name: "Server stats", icon: "stats" },
    ],
  },
  {
    name: "Support",
    items: [
      { id: "orchid", href: "/parley", name: "Tickets", icon: "tickets" },
      { id: "orchid", href: "/applications", name: "Applications", icon: "applications" },
    ],
  },
  {
    name: "Gaming",
    items: [
      { id: "volt", href: "/rally", name: "Groups and raids", icon: "groups" },
      { id: "volt", href: "/voice", name: "Voice rooms", icon: "voice" },
    ],
  },
  {
    name: "",
    foot: true,
    items: [
      { id: "steel", href: "/settings", name: "Settings", icon: "settings" },
      { id: "steel", href: "/help", name: "Help", icon: "help" },
      { id: "steel", href: "/plan", name: "Plan", icon: "plan", sheetOnly: true },
    ],
  },
];

/** Folded groups live in a cookie, so the rail is drawn folded on the server: no flash. */
const FOLD_COOKIE = "nav_folded";

/** Whether each module works, by its path ("/ranks"): on, blocked (on but can't work), off. */
export type ModuleStates = Record<string, "on" | "blocked" | "off">;

const STATE_WORDS = { on: "On", blocked: "Needs you", off: "Off" } as const;

function State({
  state,
  changed,
}: {
  state: "on" | "blocked" | "off" | undefined;
  /** It just changed (a switch flipped, a channel picked): the light flares once. */
  changed?: boolean;
}) {
  if (!state) return null;
  return (
    <span
      // A new key on a change re-plays the flare; first paint never flares.
      key={changed ? `${state}-now` : state}
      className="g-nav__state"
      data-state={state}
      data-changed={changed ? "" : undefined}
      title={STATE_WORDS[state]}
    >
      <span className="sr-only">, {STATE_WORDS[state].toLowerCase()}</span>
    </span>
  );
}

/** `rail`: the grouped menu in the server rail. `sheet`: the pinned phone menu. */
export function ServerNav({
  guildId,
  variant,
  states = {},
  folded: foldedAtLoad = [],
}: {
  guildId: string;
  variant: "rail" | "sheet";
  states?: ModuleStates;
  /** Rail groups folded last time (from the cookie). */
  folded?: string[];
}) {
  const pathname = usePathname();
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(foldedAtLoad));
  const keepFolded = (next: ReadonlySet<string>) => {
    setFolded(next);
    // biome-ignore lint/suspicious/noDocumentCookie: a preference the server reads to draw the rail
    document.cookie = `${FOLD_COOKIE}=${encodeURIComponent([...next].join("|"))}; path=/; max-age=31536000; samesite=lax`;
  };
  // What changed since the last render (a save refreshes the layout): those lights flare.
  const seen = useRef<ModuleStates | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const stateKey = JSON.stringify(states);
  // biome-ignore lint/correctness/useExhaustiveDependencies: stateKey stands for states
  useEffect(() => {
    const before = seen.current;
    seen.current = states;
    if (!before) return;
    const moved = Object.keys(states).filter((k) => before[k] !== states[k]);
    if (moved.length) setChanged(new Set(moved));
  }, [stateKey]);
  const base = `/servers/${guildId}`;
  const sheet = useRef<HTMLDetailsElement>(null);
  const rail = useRef<HTMLElement>(null);
  // On phones the menu is a sheet behind one button: close it once a page is picked. On
  // wider screens the rail scrolls on its own: keep the current page in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the page changes
  useEffect(() => {
    if (sheet.current) sheet.current.open = false;
    // The menu list scrolls on its own between the server card and the plan card.
    const nav = rail.current;
    const here = rail.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !here || nav.scrollHeight <= nav.clientHeight) return;
    const top = here.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    if (top < nav.scrollTop || top + here.offsetHeight > nav.scrollTop + nav.clientHeight)
      nav.scrollTop = top - nav.clientHeight / 3;
  }, [pathname]);
  // The open sheet sits over the page: a tap outside it or Escape puts it away.
  useEffect(() => {
    const close = (e: Event) => {
      const el = sheet.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        el.open = false;
        el.querySelector("summary")?.focus();
      } else if (!el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  // Sub-pages (LFG templates, a ticket) keep their module lit.
  const isCurrent = (href: string, own: string) =>
    pathname === href || Boolean(own && pathname.startsWith(`${href}/`));
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.map((item) => {
      const href = `${base}${item.href}`;
      return { ...item, href, path: item.href, current: isCurrent(href, item.href) };
    }),
  }));
  const all = groups.flatMap((g) => g.items);
  // Search isn't in the menu; on phones this bar is the page's visible title, so it says so.
  const here =
    all.find((i) => i.current) ??
    (pathname.endsWith("/search")
      ? { ...(all[0] as (typeof all)[number]), id: "steel" as const, name: "Search" }
      : (all[0] as (typeof all)[number]));
  const hereGroup = groups.find((g) => g.items.some((i) => i.current))?.name ?? "";
  // Arriving on a page opens its group, even one folded before.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the page changes
  useEffect(() => {
    if (variant === "rail" && hereGroup && folded.has(hereGroup)) {
      const next = new Set(folded);
      next.delete(hereGroup);
      keepFolded(next);
    }
  }, [hereGroup]);

  const link = (item: (typeof all)[number], section: string, className: string) => (
    <Link
      key={item.name}
      className={className}
      data-id={item.id}
      // No prefetching: twenty links each rendering their page in the background, again
      // after every refresh (the AI assistant refreshes every 2 s while it waits), ran the
      // database out of connections. The page's loading frame shows the moment one is picked.
      prefetch={false}
      // The group each item sits under, named beside the page title (app.css).
      data-section={section || undefined}
      href={item.href}
      transitionTypes={["nav"]}
      aria-current={item.current ? "page" : undefined}
    >
      <NavIcon name={item.icon} />
      <span className="g-nav__name">{item.name}</span>
      <State state={states[item.path]} changed={changed.has(item.path)} />
      <LinkPending />
    </Link>
  );

  if (variant === "rail")
    return (
      // Desktop and tablet: the rail, grouped, each page with its icon and whether it's on.
      // A group folds behind its name; Settings stays at the foot as the list scrolls.
      <nav className="g-nav" aria-label="Server pages" ref={rail}>
        {groups.map((g) => {
          const items = g.items.filter((item) => !item.sheetOnly);
          const shut = Boolean(g.name) && folded.has(g.name) && g.name !== hereGroup;
          // A folded group still says when one of its pages needs you.
          const needs = shut && items.some((i) => states[i.path] === "blocked");
          const list = `nav-${g.name.toLowerCase() || (g.foot ? "foot" : "main")}`;
          return (
            <div
              className={g.foot ? "g-nav__section g-nav__section--foot" : "g-nav__section"}
              key={list}
            >
              {g.name ? (
                <button
                  type="button"
                  className="g-nav__group g-label"
                  data-id={items[0]?.id}
                  aria-expanded={!shut}
                  aria-controls={list}
                  onClick={() => {
                    const next = new Set(folded);
                    if (shut || folded.has(g.name)) next.delete(g.name);
                    else next.add(g.name);
                    keepFolded(next);
                  }}
                >
                  <span className="g-nav__group-name">{g.name}</span>
                  {needs ? <State state="blocked" /> : null}
                  <span className="g-nav__fold" aria-hidden="true" />
                </button>
              ) : null}
              <div className="g-nav__items" id={list} hidden={shut}>
                {items.map((item) => link(item, g.name, "g-nav__item"))}
              </div>
            </div>
          );
        })}
      </nav>
    );
  return (
    // Phones: one button naming where you are; it opens every page as a sheet.
    <details className="nav-sheet" ref={sheet}>
      <summary className="nav-sheet__bar" data-id={here.id}>
        <span className="nav-sheet__gem" aria-hidden="true" />
        <span className="nav-sheet__here">{here.name}</span>
        <span className="nav-sheet__more">All pages</span>
      </summary>
      <nav className="nav-sheet__body" aria-label="Server pages">
        {groups.map((g) => (
          <div className="nav-sheet__group" key={g.name || (g.foot ? "foot" : "main")}>
            {g.name ? (
              <div className="g-nav__group g-label" data-id={g.items[0]?.id}>
                {g.name}
              </div>
            ) : null}
            {g.items.map((item) => link(item, g.name, "nav-sheet__item"))}
          </div>
        ))}
      </nav>
    </details>
  );
}
