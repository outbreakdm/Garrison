"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, ViewTransition } from "react";

/**
 * Plain names first: the address keeps each module's original path. Each part of the
 * server has a colour identity (Safety azure, Community orchid, Gaming volt, Server
 * steel); the current page's identity colours the whole page (app.css, Card Table).
 */
const ITEMS = [
  { group: null, id: "volt", href: "", name: "Overview" },
  { group: "Safety", id: "azure", href: "/watch", name: "Moderation" },
  { group: null, id: "azure", href: "/gatehouse", name: "Security" },
  { group: null, id: "azure", href: "/ledger", name: "Logs" },
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
  const nav = useRef<HTMLElement>(null);
  // On phones the menu is one scrolling row: keep the current page in view. A layout
  // effect, so the row is scrolled before a page transition takes its picture.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the page changes
  useLayoutEffect(() => {
    const el = nav.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current || el.scrollWidth <= el.clientWidth) return;
    const box = el.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    el.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
  }, [pathname]);
  let section = "";
  return (
    <nav className="g-nav" aria-label="Server" ref={nav}>
      {/* The section each item sits under, named beside the page title (app.css). */}
      {ITEMS.map((item) => {
        const href = `${base}${item.href}`;
        // Sub-pages (LFG templates, a ticket) keep their module lit.
        const current = pathname === href || Boolean(item.href && pathname.startsWith(`${href}/`));
        if (item.group) section = item.group;
        return (
          <div key={item.name}>
            {item.group ? (
              <div className="g-nav__group g-label" data-id={item.id}>
                {item.group}
              </div>
            ) : null}
            <Link
              className="g-nav__item"
              data-id={item.id}
              data-section={section || undefined}
              href={href}
              transitionTypes={["nav"]}
              aria-current={current ? "page" : undefined}
            >
              {current ? (
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
        );
      })}
    </nav>
  );
}
