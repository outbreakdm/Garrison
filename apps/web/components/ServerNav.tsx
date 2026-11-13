"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, ViewTransition } from "react";

/** Plain names first: the address keeps each module's original path. */
const ITEMS = [
  { group: null, href: "", name: "Overview" },
  { group: "Safety", href: "/watch", name: "Moderation" },
  { group: null, href: "/gatehouse", name: "Security" },
  { group: null, href: "/ledger", name: "Logs" },
  { group: "Community", href: "/herald", name: "Welcome" },
  { group: null, href: "/insignia", name: "Role menus" },
  { group: null, href: "/parley", name: "Tickets" },
  { group: null, href: "/ranks", name: "Leveling" },
  { group: null, href: "/spoils", name: "Giveaways" },
  { group: null, href: "/honors", name: "Starboard" },
  { group: null, href: "/beacon", name: "Stream alerts" },
  { group: null, href: "/dispatch", name: "Messages" },
  { group: "Gaming", href: "/rally", name: "Groups and raids" },
  { group: null, href: "/barracks", name: "Game accounts" },
  { group: "Server", href: "/quartermaster", name: "AI builder" },
  { group: null, href: "/settings", name: "Settings" },
  { group: null, href: "/plan", name: "Plan" },
];

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
  return (
    <nav className="g-nav" aria-label="Server" ref={nav}>
      {ITEMS.map((item) => {
        const href = `${base}${item.href}`;
        // Sub-pages (LFG templates, a ticket) keep their module lit.
        const current = pathname === href || Boolean(item.href && pathname.startsWith(`${href}/`));
        return (
          <div key={item.name}>
            {item.group ? <div className="g-nav__group g-label">{item.group}</div> : null}
            <Link
              className="g-nav__item"
              href={href}
              transitionTypes={["nav"]}
              aria-current={current ? "page" : undefined}
            >
              {current ? (
                // One pip, so moving pages slides it from the old item to the new one.
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
