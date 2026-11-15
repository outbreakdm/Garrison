"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps a scrolling log at its newest line: on first show and whenever `marker` changes
 * (a new message, a reply arriving). Renders nothing; place it right after the log.
 */
export function ScrollToEnd({ marker }: { marker: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll again when the marker moves
  useEffect(() => {
    const box = ref.current?.previousElementSibling;
    if (box && box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight;
  }, [marker]);
  return <span ref={ref} hidden />;
}
