"use client";

import { useEffect, useState } from "react";

/**
 * Shown when a page throws while it renders. Most such errors are brief: Discord rate
 * limiting the bot's reads, or the database pool being busy for a moment. So it tries again
 * once by itself, and then offers "Try again". The reference is Next's digest of the error,
 * which matches the line in the server's logs.
 *
 * One automatic retry per 30 s across the whole tab, so a page that keeps failing can't loop.
 */
let lastAutoRetry = 0;
const AUTO_RETRY_AFTER_MS = 1500;
const AUTO_RETRY_EVERY_MS = 30_000;

export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
    if (Date.now() - lastAutoRetry < AUTO_RETRY_EVERY_MS) return;
    lastAutoRetry = Date.now();
    setRetrying(true);
    const timer = setTimeout(retry, AUTO_RETRY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [error, retry]);

  return (
    <div className="g-card load-error" role="alert">
      <h1>This page couldn't load</h1>
      <p className="muted">
        {retrying
          ? "Trying again…"
          : "Discord or Garrison's database didn't answer in time. That usually passes in a moment."}
      </p>
      <div className="load-error__actions">
        <button
          type="button"
          className="g-btn g-btn--primary"
          onClick={() => {
            setRetrying(true);
            retry();
          }}
        >
          Try again
        </button>
        <a className="g-btn g-btn--secondary" href="/servers">
          Your servers
        </a>
      </div>
      {digest ? <p className="load-error__ref muted">Reference {digest}</p> : null}
    </div>
  );
}
