"use client";

import { useEffect, useRef } from "react";

/** How close to the bottom still counts as "at the newest message", in pixels. */
const NEAR_END = 80;

/**
 * Keeps a scrolling log at its newest line. It opens there, and when `marker` changes (a new
 * message, a reply arriving) it follows only if the reader was already at the bottom: someone
 * scrolled up to read earlier messages isn't pulled away from them. Renders nothing; place it
 * right after the log.
 */
export function ScrollToEnd({ marker }: { marker: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Starts true, so the first show always lands at the newest message.
  const atEnd = useRef(true);

  useEffect(() => {
    const box = ref.current?.previousElementSibling;
    if (!(box instanceof HTMLElement)) return;
    const onScroll = () => {
      atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight <= NEAR_END;
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll again when the marker moves
  useEffect(() => {
    const box = ref.current?.previousElementSibling;
    if (!(box instanceof HTMLElement) || !atEnd.current) return;
    if (box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight;
  }, [marker]);
  return <span ref={ref} hidden />;
}
