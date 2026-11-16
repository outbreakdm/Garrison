"use client";

import { useEffect, useState } from "react";

/**
 * Under a number field: Garrison's recommended value (its setting for a new server). A quiet
 * check while the field holds it; otherwise "Recommended: 15. Use it", which puts it in the
 * field and fires the events a typed change would, so a self-saving panel saves it. Before
 * scripts load it's just the sentence.
 */
export function RecValue({ field, value }: { field: string; value: number }) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const el = document.getElementById(field);
    if (!(el instanceof HTMLInputElement)) return;
    const read = () => setCurrent(el.value);
    read();
    el.addEventListener("input", read);
    el.addEventListener("change", read);
    return () => {
      el.removeEventListener("input", read);
      el.removeEventListener("change", read);
    };
  }, [field]);

  if (current !== null && Number(current) === value)
    return <span className="rec-value rec-value--on">Recommended setting</span>;
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
      {current !== null ? (
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
