"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While Garrison is working on a request, re-render the page: every second for the
 * first ten (most requests finish within a couple), then every few seconds, for up
 * to a minute.
 */
export function AutoRefresh({ every = 3000, forMs = 60_000 }: { every?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const elapsed = Date.now() - started;
      if (elapsed > forMs) return;
      router.refresh();
      timer = setTimeout(tick, elapsed < 10_000 ? 1000 : every);
    };
    timer = setTimeout(tick, 1000);
    return () => clearTimeout(timer);
  }, [router, every, forMs]);
  return null;
}
