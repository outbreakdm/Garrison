"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NavIcon, type NavIconName } from "./NavIcon";

/**
 * Plain names first: the address keeps each module's original path. The groups follow what
 * an owner sets out to do (keep it safe, greet people, keep them talking, run the community,
 * play); each page keeps its color identity (Safety cobalt, people pages orchid, Gaming volt,
 * the server's own pages steel), which colors the whole page (app.css).
 */
const ITEMS: {
  group: string | null;
  id: "volt" | "cobalt" | "orchid" | "steel";
  href: string;
  name: string;
  icon: NavIconName;
  /** Only in the phone menu: the rail has the plan card at its foot. */
  sheetOnly?: boolean;
}[] = [
  { group: "", id: "volt", href: "", name: "Overview", icon: "overview" },
  { group: null, id: "steel", href: "/quartermaster", name: "AI assistant", icon: "ai" },
  { group: null, id: "steel", href: "/insights", name: "Insights", icon: "insights" },
  { group: null, id: "steel", href: "/settings", name: "Settings", icon: "settings" },
  { group: "Safety", id: "cobalt", href: "/watch", name: "Moderation", icon: "moderation" },
  { group: null, id: "cobalt", href: "/gatehouse", name: "Security", icon: "security" },
  { group: null, id: "cobalt", href: "/ledger", name: "Logs", icon: "logs" },
  { group: "Onboarding", id: "orchid", href: "/herald", name: "Welcome", icon: "welcome" },
  { group: null, id: "orchid", href: "/insignia", name: "Role menus", icon: "roles" },
  { group: "Engagement", id: "orchid", href: "/ranks", name: "Leveling", icon: "leveling" },
  { group: null, id: "orchid", href: "/spoils", name: "Giveaways", icon: "giveaways" },
  { group: null, id: "orchid", href: "/honors", name: "Starboard", icon: "starboard" },
  { group: null, id: "orchid", href: "/suggestions", name: "Suggestions", icon: "suggestions" },
  { group: "Community", id: "orchid", href: "/parley", name: "Tickets", icon: "tickets" },
  { group: null, id: "orchid", href: "/dispatch", name: "Messages", icon: "messages" },
  { group: null, id: "orchid", href: "/beacon", name: "Stream alerts", icon: "alerts" },
  { group: null, id: "orchid", href: "/invites", name: "Invites", icon: "invites" },
  { group: null, id: "orchid", href: "/stats", name: "Server stats", icon: "stats" },
  { group: "Gaming", id: "volt", href: "/rally", name: "Groups and raids", icon: "groups" },
  { group: null, id: "volt", href: "/voice", name: "Voice rooms", icon: "voice" },
  { group: null, id: "volt", href: "/barracks", name: "Game accounts", icon: "accounts" },
  { group: null, id: "steel", href: "/plan", name: "Plan", icon: "plan", sheetOnly: true },
];

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
}: {
  guildId: string;
  variant: "rail" | "sheet";
  states?: ModuleStates;
}) {
  const pathname = usePathname();
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
    // The rail scrolls inside the server sidebar.
    const nav = (rail.current?.closest<HTMLElement>(".console__side") ??
      rail.current) as HTMLElement | null;
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
  let section = "";
  const items = ITEMS.map((item) => {
    if (item.group !== null) section = item.group;
    const href = `${base}${item.href}`;
    return { ...item, href, path: item.href, section, current: isCurrent(href, item.href) };
  });
  const here = items.find((i) => i.current) ?? (items[0] as (typeof items)[number]);
  const groups = [...new Set(items.map((i) => i.section))].map((name) => ({
    name,
    items: items.filter((i) => i.section === name),
  }));

  if (variant === "rail")
    return (
      // Desktop and tablet: the rail, grouped, each page with its icon and whether it's on.
      <nav className="g-nav" aria-label="Server pages" ref={rail}>
        {groups.map((g) => (
          <div className="g-nav__section" key={g.name || "main"}>
            {g.name ? (
              <div className="g-nav__group g-label" data-id={g.items[0]?.id}>
                {g.name}
              </div>
            ) : null}
            {g.items
              .filter((item) => !item.sheetOnly)
              .map((item) => (
                <Link
                  key={item.name}
                  className="g-nav__item"
                  data-id={item.id}
                  // The section each item sits under, named beside the page title (app.css).
                  data-section={item.section || undefined}
                  href={item.href}
                  transitionTypes={["nav"]}
                  aria-current={item.current ? "page" : undefined}
                >
                  <NavIcon name={item.icon} />
                  <span className="g-nav__name">{item.name}</span>
                  <State state={states[item.path]} changed={changed.has(item.path)} />
                </Link>
              ))}
          </div>
        ))}
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
          <div className="nav-sheet__group" key={g.name || "main"}>
            {g.name ? (
              <div className="g-nav__group g-label" data-id={g.items[0]?.id}>
                {g.name}
              </div>
            ) : null}
            {g.items.map((item) => (
              <Link
                key={item.name}
                className="nav-sheet__item"
                data-id={item.id}
                href={item.href}
                transitionTypes={["nav"]}
                aria-current={item.current ? "page" : undefined}
              >
                <NavIcon name={item.icon} />
                <span className="g-nav__name">{item.name}</span>
                <State state={states[item.path]} changed={changed.has(item.path)} />
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </details>
  );
}
