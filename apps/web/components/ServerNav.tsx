"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, ViewTransition } from "react";

/**
 * Plain names first: the address keeps each module's original path. Each part of the
 * server has a color identity (Safety cobalt, Community orchid, Gaming volt, Server
 * steel); the current page's identity colors the whole page (app.css, Card Table).
 */
const ITEMS = [
  { group: null, id: "volt", href: "", name: "Overview" },
  { group: "Safety", id: "cobalt", href: "/watch", name: "Moderation" },
  { group: null, id: "cobalt", href: "/gatehouse", name: "Security" },
  { group: null, id: "cobalt", href: "/ledger", name: "Logs" },
  { group: "Community", id: "orchid", href: "/herald", name: "Welcome" },
  { group: null, id: "orchid", href: "/insignia", name: "Role menus" },
  { group: null, id: "orchid", href: "/parley", name: "Tickets" },
  { group: null, id: "orchid", href: "/ranks", name: "Leveling" },
  { group: null, id: "orchid", href: "/spoils", name: "Giveaways" },
  { group: null, id: "orchid", href: "/honors", name: "Starboard" },
  { group: null, id: "orchid", href: "/suggestions", name: "Suggestions" },
  { group: null, id: "orchid", href: "/beacon", name: "Stream alerts" },
  { group: null, id: "orchid", href: "/dispatch", name: "Messages" },
  { group: "Gaming", id: "volt", href: "/rally", name: "Groups and raids" },
  { group: null, id: "volt", href: "/voice", name: "Voice rooms" },
  { group: null, id: "volt", href: "/barracks", name: "Game accounts" },
  { group: "Server", id: "steel", href: "/insights", name: "Insights" },
  { group: null, id: "steel", href: "/quartermaster", name: "AI assistant" },
  { group: null, id: "steel", href: "/settings", name: "Settings" },
  { group: null, id: "steel", href: "/plan", name: "Plan" },
] as const;

/** `rail`: the grouped menu in the server rail. `sheet`: the pinned phone menu. */
export function ServerNav({ guildId, variant }: { guildId: string; variant: "rail" | "sheet" }) {
  const pathname = usePathname();
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
    if (item.group) section = item.group;
    const href = `${base}${item.href}`;
    return { ...item, href, section, current: isCurrent(href, item.href) };
  });
  const overview = items[0] as (typeof items)[number];
  const here = items.find((i) => i.current) ?? overview;
  const groups = ["Safety", "Community", "Gaming", "Server"].map((name) => ({
    name,
    items: items.filter((i) => i.section === name),
  }));
  if (variant === "rail")
    return (
      // Desktop and tablet: the rail, grouped by section, each group led by its gem.
      <nav className="g-nav" aria-label="Server pages" ref={rail}>
        {/* The section each item sits under, named beside the page title (app.css). */}
        {items.map((item) => (
          <div key={item.name}>
            {item.group ? (
              <div className="g-nav__group g-label" data-id={item.id}>
                {item.group}
              </div>
            ) : null}
            <Link
              className="g-nav__item"
              data-id={item.id}
              data-section={item.section || undefined}
              href={item.href}
              transitionTypes={["nav"]}
              aria-current={item.current ? "page" : undefined}
            >
              {item.current ? (
                // One gem, so moving pages slides it from the old item to the new one.
                <ViewTransition
                  name="nav-pip"
                  share={{ nav: "pip", default: "none" }}
                  default="none"
                >
                  <span className="g-nav__pip" aria-hidden="true" />
                </ViewTransition>
              ) : null}
              <span className="g-nav__name">{item.name}</span>
            </Link>
          </div>
        ))}
      </nav>
    );
  return (
    // Phones: one button naming where you are; it opens the four sections as a sheet.
    <details className="nav-sheet" ref={sheet}>
      <summary className="nav-sheet__bar" data-id={here.id}>
        <span className="nav-sheet__gem" aria-hidden="true" />
        <span className="nav-sheet__here">{here.name}</span>
        <span className="nav-sheet__more">All pages</span>
      </summary>
      <nav className="nav-sheet__body" aria-label="Server pages">
        <Link
          className="nav-sheet__item nav-sheet__item--wide"
          data-id={overview.id}
          href={overview.href}
          transitionTypes={["nav"]}
          aria-current={overview.current ? "page" : undefined}
        >
          {overview.name}
        </Link>
        {groups.map((g) => (
          <div className="nav-sheet__group" key={g.name}>
            <div className="g-nav__group g-label" data-id={g.items[0]?.id}>
              {g.name}
            </div>
            {g.items.map((item) => (
              <Link
                key={item.name}
                className="nav-sheet__item"
                data-id={item.id}
                href={item.href}
                transitionTypes={["nav"]}
                aria-current={item.current ? "page" : undefined}
              >
                {item.name}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </details>
  );
}
