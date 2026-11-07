"use client";

import { modules } from "@garrison/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
];

export function ServerNav({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  const nav = useRef<HTMLElement>(null);
  // On phones the menu is one scrolling row: keep the current page in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the page changes
  useEffect(() => {
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
        return (
          <div key={item.name}>
            {item.group ? <div className="g-nav__group g-label">{item.group}</div> : null}
            <Link
              className="g-nav__item"
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              <span className="g-nav__name">{item.name}</span>
              {item.plain ? <span className="g-nav__plain">{item.plain}</span> : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
