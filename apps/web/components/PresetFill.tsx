"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Level cards that stand for numbers: "Balanced" is 6 messages in 8 seconds. Picking a card
 * fills those number fields in the same form (and a panel that saves itself saves them);
 * typing your own numbers picks Custom, or the card they match. The numbers stay on the
 * page under the cards, so nothing is hidden. The radio's name starts with "_": the server
 * reads only the numbers.
 */
export interface FillOption {
  value: string;
  label: string;
  line: string;
  fills: Record<string, number>;
}

export function PresetFill({
  name,
  label,
  options,
  current,
  help,
}: {
  /** The radio's name, "_" first so no action reads it. */
  name: `_${string}`;
  label: string;
  /** Weakest first, as level cards. */
  options: FillOption[];
  /** The numbers as stored, to light the card they match. */
  current: Record<string, number>;
  help?: ReactNode;
}) {
  const matching = (values: Record<string, number>) =>
    options.find((o) => Object.entries(o.fills).every(([k, v]) => values[k] === v))?.value ??
    "custom";
  const [picked, setPicked] = useState(() => matching(current));
  const root = useRef<HTMLFieldSetElement>(null);
  const fieldNames = Object.keys(options[0]?.fills ?? {});

  const field = (n: string) => {
    const el = root.current?.form?.elements.namedItem(n);
    return el instanceof HTMLInputElement ? el : null;
  };

  // Typing a number lights the card it matches, or Custom.
  useEffect(() => {
    const form = root.current?.form;
    if (!form) return;
    const onInput = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !fieldNames.includes(t.name)) return;
      const values = Object.fromEntries(fieldNames.map((n) => [n, Number(field(n)?.value)]));
      setPicked(matching(values));
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  });

  const pick = (value: string) => {
    setPicked(value);
    const o = options.find((x) => x.value === value);
    if (!o) return;
    for (const [n, v] of Object.entries(o.fills)) {
      const el = field(n);
      if (!el) continue;
      el.value = String(v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const cards = [
    ...options,
    { value: "custom", label: "Custom", line: "Your own numbers below", fills: {} },
  ];
  return (
    <fieldset className="choice" ref={root}>
      <legend className="choice__legend">{label}</legend>
      <div className="pick-cards pick-cards--level">
        {cards.map((o, i) => (
          <label className="pick-card" key={o.value}>
            <input
              className="pick-card__input"
              type="radio"
              name={name}
              value={o.value}
              checked={picked === o.value}
              onChange={() => pick(o.value)}
            />
            <span className="pick-card__bars" aria-hidden="true">
              {options.map((b, j) => (
                <span
                  key={b.value}
                  className={`pick-card__bar${o.value !== "custom" && j <= i ? " is-on" : ""}`}
                />
              ))}
            </span>
            <span className="pick-card__name">{o.label}</span>
            <span className="pick-card__line">{o.line}</span>
          </label>
        ))}
      </div>
      {help ? <span className="g-help">{help}</span> : null}
    </fieldset>
  );
}
