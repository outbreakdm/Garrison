"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** A word a template fills in when it's sent: `{count}` shown as "Count". */
export interface TemplateVar {
  key: string;
  label: string;
  /** What it becomes, for the hint: "how many members there are now". */
  about?: string;
  /** What goes in the text, when it isn't `{key}`: a role mention, say. */
  insert?: string;
  /** Left out of the buttons under the field (there are many: every role). */
  chip?: false;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

interface Props {
  vars: readonly TemplateVar[];
  /** Controlled: the text and its setter. Left out, the field keeps its own (forms). */
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  name?: string;
  id?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Hide the row of buttons under the field (when the page lists the variables itself). */
  hideChips?: boolean;
}

/** The "@word" being typed right before the caret, if any. */
function trigger(text: string, caret: number) {
  const m = /(^|\s)@([\w]*)$/.exec(text.slice(0, caret));
  return m ? { start: caret - (m[2]?.length ?? 0) - 1, query: (m[2] ?? "").toLowerCase() } : null;
}

/**
 * A text field where the words a template fills in are picked, not typed: "@" opens the
 * list (filtered as you go on typing), Enter or Tab picks, and the field gets `{count}`.
 * The buttons under it insert at the caret too. Works in plain forms (name, defaultValue)
 * and as a controlled field.
 */
export function TemplateField({
  vars,
  value,
  onChange,
  defaultValue = "",
  name,
  id,
  className = "g-input",
  multiline = false,
  rows = 3,
  maxLength,
  placeholder,
  required,
  disabled,
  hideChips = false,
  ...aria
}: Props) {
  const own = value === undefined;
  const [inner, setInner] = useState(defaultValue);
  const text = own ? inner : value;
  const ref = useRef<Field>(null);
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const caretAfter = useRef<number | null>(null);
  const listId = useId();
  const options = menu
    ? vars
        .filter(
          (v) =>
            v.key.toLowerCase().startsWith(menu.query) ||
            v.label.toLowerCase().replace(/^[@#]/, "").startsWith(menu.query),
        )
        .slice(0, 8)
    : [];

  // Put the caret after what was inserted, once the new text is on screen, and let a panel
  // that saves itself (components/AutoSave) know the field changed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (caretAfter.current === null || !el) return;
    el.focus();
    el.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const set = (next: string) => {
    if (own) setInner(next);
    onChange?.(next);
  };

  const insert = (v: TemplateVar, from?: number) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const start = from ?? caret;
    const token = v.insert ?? `{${v.key}}`;
    const next = `${text.slice(0, start)}${token}${text.slice(caret)}`;
    if (maxLength && next.length > maxLength) return;
    caretAfter.current = start + token.length;
    setMenu(null);
    set(next);
  };

  const changed = (e: ChangeEvent<Field>) => {
    set(e.target.value);
    setMenu(trigger(e.target.value, e.target.selectionStart ?? e.target.value.length));
    setActive(0);
  };

  const keys = (e: KeyboardEvent<Field>) => {
    if (!menu || !options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const pick = options[active];
      if (pick) insert(pick, menu.start);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMenu(null);
    }
  };

  const shared = {
    id,
    name,
    className,
    value: text,
    maxLength,
    placeholder,
    required,
    disabled,
    autoComplete: "off",
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-expanded": Boolean(menu && options.length),
    "aria-controls": listId,
    "aria-activedescendant": menu && options[active] ? `${listId}-${active}` : undefined,
    onChange: changed,
    onKeyDown: keys,
    onBlur: () => setTimeout(() => setMenu(null), 120),
    ...aria,
  };

  return (
    <span className="tpl-field">
      <span className="tpl-field__box">
        {multiline ? (
          <textarea {...shared} ref={ref as React.RefObject<HTMLTextAreaElement>} rows={rows} />
        ) : (
          <input {...shared} ref={ref as React.RefObject<HTMLInputElement>} />
        )}
        {menu && options.length ? (
          <span className="tpl-field__menu" id={listId} role="listbox" aria-label="Fill in">
            {options.map((v, i) => (
              <span
                key={`${v.key}:${v.insert ?? ""}`}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                className="tpl-field__option"
                onMouseDown={(e) => {
                  // Before the field loses focus, so the caret is still where it was.
                  e.preventDefault();
                  insert(v, menu.start);
                }}
              >
                <span className="tpl-field__label">{v.label}</span>
                {v.about ? <span className="tpl-field__about">{v.about}</span> : null}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {hideChips || disabled ? null : (
        <span className="tpl-field__chips">
          <span className="tpl-field__hint">Type @ to add</span>
          {vars
            .filter((v) => v.chip !== false)
            .map((v) => (
              <button
                type="button"
                key={`${v.key}:${v.insert ?? ""}`}
                className="tpl-chip"
                title={v.about}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(v)}
              >
                {v.label}
              </button>
            ))}
        </span>
      )}
    </span>
  );
}
