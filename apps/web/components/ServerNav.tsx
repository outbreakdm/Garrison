"use client";

import { modules } from "@garrison/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, ViewTransition } from "react";

const ITEMS = [
  { group: null, href: "", name: "Overview", plain: null },
  { group: "Guard", href: "/watch", name: modules.watch.name, plain: modules.watch.plain },
  { group: null, href: "/gatehouse", name: modules.gatehouse.name, plain: modules.gatehouse.plain },
  { group: null, href: "/ledger", name: modules.ledger.name, plain: modules.ledger.plain },
  { group: "Rally", href: "/rally", name: modules.rally.name, plain: "LFG and events" },
  { group: null, href: "/barracks", name: modules.barracks.name, plain: modules.barracks.plain },
  { group: null, href: "/ranks", name: modules.ranks.name, plain: modules.ranks.plain },
  {
    group: "Configure",
    href: "/quartermaster",
    name: modules.quartermaster.name,
    plain: modules.quartermaster.plain,
  },
  { group: null, href: "/settings", name: "Settings", plain: null },
  { group: null, href: "/plan", name: "Plan", plain: null },
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
        // Sub-pages (Rally templates) keep their module lit.
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
              {item.plain ? <span className="g-nav__plain">{item.plain}</span> : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
