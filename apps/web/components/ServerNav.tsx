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
  { group: null, id: "orchid", href: "/beacon", name: "Stream alerts" },
  { group: null, id: "orchid", href: "/dispatch", name: "Messages" },
  { group: "Gaming", id: "volt", href: "/rally", name: "Groups and raids" },
  { group: null, id: "volt", href: "/barracks", name: "Game accounts" },
  { group: "Server", id: "steel", href: "/quartermaster", name: "AI builder" },
  { group: null, id: "steel", href: "/settings", name: "Settings" },
  { group: null, id: "steel", href: "/plan", name: "Plan" },
] as const;

export function ServerNav({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const sheet = useRef<HTMLDetailsElement>(null);
  // On phones the menu is a sheet behind one button: close it once a page is picked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the page changes
  useEffect(() => {
    if (sheet.current) sheet.current.open = false;
  }, [pathname]);
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
  return (
    <>
      {/* Desktop and tablet: the rail, grouped by section, each group led by its gem. */}
      <nav className="g-nav" aria-label="Server">
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
      {/* Phones: one button naming where you are; it opens the four sections as a sheet. */}
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
    </>
  );
}
