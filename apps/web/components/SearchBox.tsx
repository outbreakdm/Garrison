"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The topbar search. A plain GET form, so it works without JavaScript; the
 * script only adds the ⌘K / Ctrl+K shortcut to focus it.
 */
export function SearchBox({ guildId, defaultValue }: { guildId: string; defaultValue?: string }) {
  const input = useRef<HTMLInputElement>(null);
  // The hint names the shortcut for this keyboard: Ctrl K, or ⌘K on a Mac.
  const [hint, setHint] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setHint("⌘K");
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <search className="searchbox">
      <form action={`/servers/${guildId}/search`} method="get">
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
          defaultValue={defaultValue}
        />
        <span className="searchbox__hint" aria-hidden="true">
          {hint}
        </span>
      </form>
    </search>
  );
}
