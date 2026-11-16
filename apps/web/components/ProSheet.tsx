"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The one way Garrison offers Pro: a sheet over the dimmed page. Any link with
 * `data-pro="<what it unlocks>"` opens it (the "See what Pro adds" in every Pro spot);
 * before scripts load, or with a modifier key, that link still goes to the Plan page.
 * The layout mounts one, only on servers without Pro.
 */
export function ProSheet({
  guildId,
  price,
  highlights,
  checkout,
}: {
  guildId: string;
  /** "$8.99". */
  price: string;
  highlights: readonly string[];
  /** Straight to Stripe Checkout for Pro, monthly; null when billing isn't set up here. */
  checkout: ((form: FormData) => Promise<void>) | null;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [about, setAbout] = useState("");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const trigger = e.target instanceof Element ? e.target.closest("[data-pro]") : null;
      if (!trigger) return;
      // Ahead of the router: the link stays a link only when the sheet can't open.
      e.preventDefault();
      e.stopPropagation();
      setAbout(trigger.getAttribute("data-pro") ?? "");
      sheet.current?.showModal();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const plans = `/servers/${guildId}/plan#plans`;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click is on the dimmed backdrop; Escape closes a modal dialog natively
    <dialog
      ref={sheet}
      className="pro-sheet"
      aria-labelledby="pro-sheet-title"
      onClick={(e) => {
        // A click on the dimmed page around the sheet closes it.
        if (e.target === e.currentTarget) sheet.current?.close();
      }}
    >
      <div className="pro-sheet__art" aria-hidden="true">
        {/* Garrison's shield, drawn in Pro's foil. */}
        <svg
          className="pro-sheet__shield"
          viewBox="0 0 64 64"
          width="52"
          height="52"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pro-sheet-foil" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd9f3" />
              <stop offset="0.3" stopColor="#d7e4ff" />
              <stop offset="0.55" stopColor="#c9f7ef" />
              <stop offset="0.78" stopColor="#f1ffc8" />
              <stop offset="1" stopColor="#ffe6c7" />
            </linearGradient>
          </defs>
          <path
            d="M58 20V12L52 6H12L6 12V38C6 50 18 56 32 61C46 56 58 50 58 38V34H33"
            fill="none"
            stroke="url(#pro-sheet-foil)"
            strokeWidth="5"
          />
        </svg>
      </div>
      <button
        type="button"
        className="pro-sheet__close"
        aria-label="Close"
        onClick={() => sheet.current?.close()}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div className="pro-sheet__content">
        <h2 className="pro-sheet__title" id="pro-sheet-title">
          Part of Garrison Pro
        </h2>
        <p className="pro-sheet__about">
          {about || "Your server's own look, higher limits and longer history."}
        </p>
        {checkout ? (
          <form action={checkout}>
            <input type="hidden" name="guildId" value={guildId} />
            <input type="hidden" name="tier" value="pro" />
            <input type="hidden" name="interval" value="month" />
            <button type="submit" className="pro-sheet__go">
              Upgrade this server, {price} a month
            </button>
          </form>
        ) : (
          <a className="pro-sheet__go" href={plans}>
            See Pro
          </a>
        )}
        <p className="pro-sheet__list-title">Pro also adds</p>
        <ul className="pro-sheet__list">
          {highlights.map((h) => (
            <li className="pro-sheet__item" key={h}>
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <path
                  d="M2.5 6.2l2.3 2.3 4.7-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
              {h}
            </li>
          ))}
        </ul>
      </div>
      <p className="pro-sheet__fine">
        Pro is per server and renews monthly until you cancel, from the{" "}
        <a href={plans}>Plan page</a>. Yearly billing and Agency are there too.
      </p>
    </dialog>
  );
}
