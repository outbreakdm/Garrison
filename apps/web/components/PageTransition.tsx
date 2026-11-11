"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, ViewTransition } from "react";

/**
 * The page under the server menu. Links tagged "nav" swap it (old page out fast,
 * new page up); refreshes, saves and requests don't animate it, so a live page
 * never stutters while Garrison works.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ nav: "page-in", default: "none" }}
      exit={{ nav: "page-out", default: "none" }}
      default="none"
    >
      <div className="page">{children}</div>
    </ViewTransition>
  );
}
