"use client";

/**
 * "Use it" under a choice: a real button (reachable by keyboard), which picks Garrison's
 * recommended option by clicking its radio, so the panel sees an ordinary change.
 */
export function RecUse({ target }: { target: string }) {
  return (
    <button
      type="button"
      className="rec-value__go"
      onClick={() => document.getElementById(target)?.click()}
    >
      Use it
    </button>
  );
}
