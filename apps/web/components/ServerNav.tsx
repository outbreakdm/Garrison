"use client";

import { modules } from "@garrison/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { group: null, href: "", name: "Overview", plain: null },
  { group: "Guard", href: "/watch", name: modules.watch.name, plain: modules.watch.plain },
  { group: null, href: "/gatehouse", name: modules.gatehouse.name, plain: modules.gatehouse.plain },
  { group: "Rally", href: "/rally", name: modules.rally.name, plain: "LFG and events" },
  { group: "Configure", href: "/settings", name: "Settings", plain: null },
];

export function ServerNav({ guildId }: { guildId: string }) {
  const pathname = usePathname();
  const base = `/servers/${guildId}`;
  return (
    <nav className="g-nav" aria-label="Server">
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
