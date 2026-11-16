"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One toast at a time, at the foot of the screen: what just happened, and the way to take
 * it back. Anything on the page calls `toast()`; the layout mounts one <Toaster />.
 */

export interface ToastInput {
  message: string;
  tone?: "ok" | "error";
  /** A button beside the message, like Undo. The toast closes when it's pressed. */
  action?: { label: string; run: () => void };
}

interface Shown extends ToastInput {
  id: number;
}

const OK_MS = 6000;
const ERROR_MS = 9000;

let push: ((t: ToastInput) => void) | null = null;
let next = 1;

/** Show a toast. Before the Toaster mounts (or on a page without one) it does nothing. */
export function toast(t: ToastInput) {
  push?.(t);
}

export function Toaster() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paused = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = () => {
    clear();
    setLeaving(true);
    timer.current = setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, 160);
  };
  const arm = (t: Shown) => {
    clear();
    if (paused.current) return;
    timer.current = setTimeout(close, t.tone === "error" ? ERROR_MS : OK_MS);
  };

  // Registered once; it reaches the latest `arm` through a ref.
  const armRef = useRef(arm);
  armRef.current = arm;
  useEffect(() => {
    push = (t) => {
      const s = { ...t, id: next++ };
      setLeaving(false);
      setShown(s);
      armRef.current(s);
    };
    return () => {
      push = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Hovering or focusing the toast holds it open; leaving starts the clock again.
  const hold = () => {
    paused.current = true;
    clear();
  };
  const release = () => {
    paused.current = false;
    if (shown) arm(shown);
  };

  return (
    <div className="toaster" aria-live="polite">
      {shown ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only hold the toast open; its role is status or alert
        <div
          key={shown.id}
          className={`toast${shown.tone === "error" ? " toast--error" : ""}${leaving ? " toast--leaving" : ""}`}
          role={shown.tone === "error" ? "alert" : "status"}
          onMouseEnter={hold}
          onMouseLeave={release}
          onFocus={hold}
          onBlur={release}
        >
          <span className="toast__mark" aria-hidden="true" />
          <span className="toast__text">{shown.message}</span>
          {shown.action ? (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                shown.action?.run();
                close();
              }}
            >
              {shown.action.label}
            </button>
          ) : null}
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={close}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
