"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The member space's tabs: one per page the server shows, the current one underlined. */
export function MemberTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="ins-tabs member__tabs" aria-label="Your pages">
      {tabs.map((t) => (
        <Link
          key={t.href}
          className="ins-tab"
          href={t.href}
          aria-current={path === t.href ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
