"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Slot } from "@/lib/slots";

/**
 * A list typed one item per box: questions, blocked words, trusted IDs. Never one box
 * with items split by lines or commas, which reads wrong the moment someone wraps a
 * line or forgets a comma. Enter adds the next box, Backspace in an empty box removes
 * it, and the count shows how many more fit.
 */
export interface ListRowsProps {
  /** Each item's form field name; omit when the parent saves the list itself. */
  name?: string;
  /** What one item is, for labels and the add button: "question", "word". */
  noun: string;
  items: string[];
  onChange: (items: string[]) => void;
  /** Called when focus leaves the whole list, to tidy (trim, drop empties). */
  onDone?: (items: string[]) => void;
  max: number;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "text" | "numeric";
  /** Shown before the add button, e.g. "Pro" when the list is locked. */
  disabled?: boolean;
}

export function ListRows({
  name,
  noun,
  items,
  onChange,
  onDone,
  max,
  maxLength,
  placeholder,
  inputMode = "text",
  disabled,
}: ListRowsProps) {
  // There is always one box to type in, even with nothing saved yet.
  const rows = items.length ? items : [""];
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  useEffect(() => {
    if (focusAt === null) return;
    inputs.current[focusAt]?.focus();
    setFocusAt(null);
  }, [focusAt]);

  const set = (i: number, value: string) => onChange(rows.map((r, j) => (j === i ? value : r)));
  const add = (at = rows.length) => {
    if (rows.length >= max) return;
    onChange([...rows.slice(0, at), "", ...rows.slice(at)]);
    setFocusAt(at);
  };
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    onChange(next);
    setFocusAt(Math.max(0, i - 1));
  };
  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Enter never submits the form from here: it opens the next box.
      e.preventDefault();
      if (rows[i]?.trim()) add(i + 1);
    } else if (e.key === "Backspace" && rows[i] === "" && rows.length > 1) {
      e.preventDefault();
      remove(i);
    }
  };
  const filled = rows.filter((r) => r.trim()).length;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  return (
    <div className="list-rows">
      <ol className="list-rows__list">
        {rows.map((value, i) => (
          // Rows have no stable id of their own; position is the identity while typing.
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          <li className="list-rows__row" key={i}>
            <span className="list-rows__num" aria-hidden="true">
              {i + 1}
            </span>
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              className="g-input"
              name={name}
              value={value}
              maxLength={maxLength}
              placeholder={i === 0 ? placeholder : undefined}
              inputMode={inputMode}
              disabled={disabled}
              aria-label={`${Noun} ${i + 1}`}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={onKey(i)}
              onBlur={(e) => {
                // Tidy once focus leaves the whole list, not when moving between its boxes.
                const list = e.currentTarget.closest(".list-rows");
                if (!list?.contains(e.relatedTarget as Node | null)) onDone?.(rows);
              }}
            />
            {rows.length > 1 || value ? (
              <button
                type="button"
                className="list-rows__remove"
                aria-label={`Remove ${noun} ${i + 1}`}
                disabled={disabled}
                onClick={() => (rows.length > 1 ? remove(i) : onChange([]))}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : (
              <span className="list-rows__remove" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
      <div className="list-rows__foot">
        <button
          type="button"
          className="g-btn g-btn--secondary g-btn--sm"
          onClick={() => add()}
          disabled={disabled || rows.length >= max}
        >
          Add {noun}
        </button>
        <span className="g-help">
          {filled} of {max}
          {rows.length >= max ? ", the most it holds" : ""}
        </span>
      </div>
    </div>
  );
}

/** The same list inside a plain form: every box posts under `name`. */
export function ListField({
  defaultItems,
  ...props
}: Omit<ListRowsProps, "items" | "onChange" | "onDone"> & {
  name: string;
  defaultItems: string[];
}) {
  const [items, setItems] = useState(defaultItems);
  return (
    <ListRows
      {...props}
      items={items}
      onChange={setItems}
      onDone={(rows) => setItems(rows.map((r) => r.trim()).filter(Boolean))}
    />
  );
}

/**
 * Roles and how many of each (a raid's Tank 2, Healer 4, DPS 14), one row per role with
 * its own count box. Posts `slotName` and `slotCount` pairs; the server joins them.
 */
export function SlotRows({
  defaultSlots,
  max = 4,
  required,
}: {
  defaultSlots: Slot[];
  max?: number;
  required?: boolean;
}) {
  const [slots, setSlots] = useState<Slot[]>(
    defaultSlots.length ? defaultSlots : [{ name: "", count: "1" }],
  );
  const names = useRef<(HTMLInputElement | null)[]>([]);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  useEffect(() => {
    if (focusAt === null) return;
    names.current[focusAt]?.focus();
    setFocusAt(null);
  }, [focusAt]);
  const set = (i: number, patch: Partial<Slot>) =>
    setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    if (slots.length >= max) return;
    setSlots([...slots, { name: "", count: "1" }]);
    setFocusAt(slots.length);
  };
  const total = slots.reduce((n, s) => n + (s.name.trim() ? Number(s.count) || 0 : 0), 0);
  return (
    <div className="list-rows">
      <ol className="list-rows__list">
        {slots.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          <li className="list-rows__row list-rows__row--slot" key={i}>
            <input
              ref={(el) => {
                names.current[i] = el;
              }}
              className="g-input"
              name="slotName"
              value={s.name}
              maxLength={20}
              required={required && i === 0}
              placeholder={i === 0 ? "Tank" : "Role"}
              aria-label={`Role ${i + 1}`}
              onChange={(e) => set(i, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (s.name.trim()) add();
                }
              }}
            />
            <input
              className="g-input list-rows__count"
              name="slotCount"
              type="number"
              min={1}
              max={40}
              value={s.count}
              aria-label={`How many ${s.name.trim() || `of role ${i + 1}`}`}
              onChange={(e) => set(i, { count: e.target.value })}
            />
            {slots.length > 1 ? (
              <button
                type="button"
                className="list-rows__remove"
                aria-label={`Remove role ${i + 1}`}
                onClick={() => setSlots(slots.filter((_, j) => j !== i))}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : (
              <span className="list-rows__remove" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
      <div className="list-rows__foot">
        <button
          type="button"
          className="g-btn g-btn--secondary g-btn--sm"
          onClick={add}
          disabled={slots.length >= max}
        >
          Add role
        </button>
        <span className="g-help">
          {total ? `${total} ${total === 1 ? "player" : "players"}` : "No roles yet"} · up to {max}{" "}
          roles
        </span>
      </div>
    </div>
  );
}
