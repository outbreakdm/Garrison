"use client";

import { useEffect, useState } from "react";

/**
 * Beside a number field that's off Garrison's recommended value (its setting for a new
 * server): "Recommended: 15. Use it", which puts it in the field and fires the events a typed
 * change would, so a self-saving panel saves it. While the field holds the recommendation it
 * says nothing, so a page of good defaults isn't a page of "Recommended setting" lines.
 *
 * `initial` is the value the field is drawn with, so the server draws the same thing scripts
 * will: nothing appears or goes away as the page loads. Before scripts load it's just the
 * sentence.
 */
export function RecValue({
  field,
  value,
  initial,
}: {
  field: string;
  value: number;
  initial: number | string;
}) {
  const [current, setCurrent] = useState(String(initial));
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = document.getElementById(field);
    if (!(el instanceof HTMLInputElement)) return;
    const read = () => setCurrent(el.value);
    read();
    setLive(true);
    el.addEventListener("input", read);
    el.addEventListener("change", read);
    return () => {
      el.removeEventListener("input", read);
      el.removeEventListener("change", read);
    };
  }, [field]);

  if (Number(current) === value) return null;
  const use = () => {
    const el = document.getElementById(field);
    if (!(el instanceof HTMLInputElement)) return;
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return (
    <span className="rec-value">
      Recommended: {value}.
      {live ? (
        <>
          {" "}
          <button type="button" className="rec-value__go" onClick={use}>
            Use it
          </button>
        </>
      ) : null}
    </span>
  );
}
