"use client";

import { PANEL_LIMITS } from "@garrison/db/cards";

/**
 * A panel's words: its title and text, and (for a panel with one button) the button's label.
 * Controlled, so the panel's preview follows every keystroke. The names are the settings' own,
 * passed in, so each module saves them under its fields.
 */
export function PanelWords({
  names,
  value,
  onChange,
}: {
  names: { title: string; body: string; button?: string };
  value: { title: string; body: string; button?: string };
  onChange: (value: { title: string; body: string; button?: string }) => void;
}) {
  return (
    <>
      <label className="g-field" htmlFor={names.title}>
        <span className="field-label">Title</span>
        <input
          className="g-input"
          id={names.title}
          name={names.title}
          maxLength={PANEL_LIMITS.title}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </label>
      <label className="g-field" htmlFor={names.body}>
        <span className="field-label">Text</span>
        <textarea
          className="g-input"
          id={names.body}
          name={names.body}
          rows={3}
          maxLength={PANEL_LIMITS.body}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </label>
      {names.button ? (
        <label className="g-field" htmlFor={names.button}>
          <span className="field-label">Button</span>
          <input
            className="g-input"
            id={names.button}
            name={names.button}
            maxLength={PANEL_LIMITS.button}
            value={value.button ?? ""}
            aria-invalid={!value.button?.trim()}
            onChange={(e) => onChange({ ...value, button: e.target.value })}
          />
        </label>
      ) : null}
    </>
  );
}
