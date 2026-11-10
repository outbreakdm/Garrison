"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { MENU, PAGES } from "@/lib/pages";

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
      {MENU.map((group) => (
        <div className="g-nav__section" key={group.label ?? "home"}>
          {group.label ? <div className="g-nav__group g-label">{group.label}</div> : null}
          {group.pages.map((key) => {
            const page = PAGES[key];
            const href = `${base}${page.path}`;
            return (
              <Link
                className="g-nav__item"
                href={href}
                key={key}
                // Sub-pages (a member, LFG templates) keep their page lit.
                aria-current={
                  pathname === href || (page.path && pathname.startsWith(`${href}/`))
                    ? "page"
                    : undefined
                }
              >
                <span className="g-nav__name">{page.title}</span>
                {page.module ? <span className="g-nav__plain">{page.module}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
