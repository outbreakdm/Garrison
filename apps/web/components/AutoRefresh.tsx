"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While Garrison is working on a request, re-render the page: every second for the
 * first ten (most requests finish within a couple), then every few seconds, then every
 * ten after a minute, for up to `forMs`. Skipped while the tab is hidden.
 */
export function AutoRefresh({ every = 3000, forMs = 60_000 }: { every?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsed = Date.now() - started;
      if (elapsed > forMs) return;
      // A tab in the background doesn't need fresh results; it catches up when shown.
      if (document.visibilityState === "visible") router.refresh();
      // Slower the longer it waits: most requests are done in seconds, and every refresh
      // renders the whole page again (database and Discord reads included).
      timer = setTimeout(
        tick,
        elapsed < 10_000 ? 1000 : elapsed < 60_000 ? every : Math.max(every, 10_000),
      );
    };
    timer = setTimeout(tick, 1000);
    return () => clearTimeout(timer);
  }, [router, every, forMs]);
  return null;
}
