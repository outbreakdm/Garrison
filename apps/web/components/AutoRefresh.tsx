"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While Garrison is working on a request, re-render the page every few seconds, for up to a minute. */
export function AutoRefresh({ every = 3000, forMs = 60_000 }: { every?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > forMs) clearInterval(timer);
      else router.refresh();
    }, every);
    return () => clearInterval(timer);
  }, [router, every, forMs]);
  return null;
}
