"use client";

import { useEffect, useState } from "react";

/**
 * Repeating rows (level rewards, XP boosts, roles from game stats) show what's set plus one
 * empty row; the rest are rendered hidden in the form. This reveals the next one and puts the
 * cursor in it, and goes away when there are none left.
 */
export function AddRow({ list, label }: { list: string; label: string }) {
  const spare = () =>
    document.getElementById(list)?.querySelector<HTMLElement>(":scope > [hidden]") ?? null;
  const [left, setLeft] = useState(true);
  useEffect(() => {
    setLeft(Boolean(spare()));
  });
  if (!left) return null;
  return (
    <button
      type="button"
      className="g-btn g-btn--ghost g-btn--sm add-row"
      onClick={() => {
        const next = spare();
        if (!next) return;
        next.hidden = false;
        next.querySelector<HTMLElement>("input, select")?.focus();
        setLeft(Boolean(spare()));
      }}
    >
      <span aria-hidden="true">+</span> {label}
    </button>
  );
}
