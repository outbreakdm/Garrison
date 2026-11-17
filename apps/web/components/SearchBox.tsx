"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The topbar search. A plain GET form, so it works without JavaScript; the
 * script only adds the ⌘K / Ctrl+K shortcut to focus it.
 *
 * On phones (docs/LAYOUT_PROPOSAL.md §5) the field waits behind an icon, so the bar stays one
 * row: the icon opens it across the top of the screen, and Escape or Close puts it away.
 * Without JavaScript the icon is a link to the search page, which has its own field.
 */
export function SearchBox({ guildId, defaultValue }: { guildId: string; defaultValue?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // On the results page the box keeps the words that found them.
  const params = useSearchParams();
  const pathname = usePathname();
  const onResults = pathname.endsWith("/search");
  const q = onResults ? (params.get("q") ?? undefined) : defaultValue;
  // The hint names the shortcut for this keyboard: Ctrl K, or ⌘K on a Mac.
  const [hint, setHint] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setHint("⌘K");
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        input.current?.focus();
        input.current?.select();
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // A search that goes somewhere closes the phone field behind it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every page change
  useEffect(() => setOpen(false), [pathname, params]);
  return (
    <search className="searchbox" data-open={open ? "" : undefined}>
      <a
        className="searchbox__open"
        href={`/servers/${guildId}/search`}
        aria-expanded={open}
        aria-controls="topbar-search-form"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="m10.5 10.5 3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="sr-only">Search</span>
      </a>
      <form id="topbar-search-form" action={`/servers/${guildId}/search`} method="get">
        <label className="sr-only" htmlFor="topbar-search">
          Search settings, members, cases
        </label>
        <input
          ref={input}
          id="topbar-search"
          className="g-input"
          name="q"
          type="search"
          maxLength={64}
          autoComplete="off"
          placeholder="Search settings, members, cases"
          defaultValue={q}
          key={q ?? ""}
        />
        <span className="searchbox__hint" aria-hidden="true">
          {hint}
        </span>
        <button
          type="button"
          className="g-btn g-btn--ghost g-btn--sm searchbox__close"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </form>
    </search>
  );
}
