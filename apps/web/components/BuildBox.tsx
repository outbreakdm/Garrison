"use client";

import type { KeyboardEvent } from "react";
import { BUILD_PROMPT_MAX } from "@/lib/build-prompt";

/**
 * The landing page's "Build me a…" box. A plain GET form to /build, so it works before
 * scripts load; with them, Enter sends and Shift+Enter starts a new line, like a chat.
 */
export function BuildBox({ action, signedIn }: { action: string; signedIn: boolean }) {
  const send = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit();
  };
  return (
    <form className="lp-build" action={action} method="get">
      <label className="lp-build__label" htmlFor="lp-idea">
        Build me a…
      </label>
      <textarea
        className="lp-build__input"
        id="lp-idea"
        name="idea"
        rows={2}
        maxLength={BUILD_PROMPT_MAX}
        required
        enterKeyHint="send"
        placeholder="raid guild with signups, a bench, officer chat and a rules channel"
        onKeyDown={send}
      />
      <div className="lp-build__foot">
        <span className="lp-build__hint">
          {signedIn
            ? "Pick a server next. Nothing changes until you approve the plan."
            : "Sign in with Discord next. Nothing changes until you approve the plan."}
        </span>
        <button type="submit" className="lp-btn lp-btn--light lp-btn--sm lp-build__go">
          Build it
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M3 8h10M9 4l4 4-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </form>
  );
}
