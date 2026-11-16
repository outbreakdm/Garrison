import type { ReactNode } from "react";

/**
 * Choices shown, not typed: a pick among a few is a row or a set of cards, never a select.
 * All three are radios under the drawing, so they post like a select, work before scripts
 * load, and a form that saves itself sees each pick as a change.
 *
 * - Segmented: a few short actions in one row (what happens to a flagged message).
 * - LevelCards: a scale, weakest to strongest, with a line under each (how strict).
 * - PresetCards: whole setups with a sentence each (how to answer a raid).
 *
 * One option can be Garrison's recommendation (its setting for a new server). It's marked,
 * and the line under the choice says so: a quiet check when it's picked, else "Recommended:
 * Balanced. Use it", where Use it is a label for that radio, so it picks it with no script.
 */

export interface Choice {
  value: string;
  label: string;
  /** Garrison's recommendation, and its setting for a new server. */
  recommended?: boolean;
}

/** The radio's id, so "Use it" can point at it. Names are unique on a page. */
export const choiceId = (name: string, value: string) => `choice-${name}-${value}`;

/** Under a choice: whether it's on Garrison's recommendation, and a way back to it. */
export function RecLine({ name, options }: { name: string; options: Choice[] }) {
  const rec = options.find((o) => o.recommended);
  if (!rec) return null;
  return (
    <span className="choice__rec">
      <span className="choice__rec-is">Recommended setting</span>
      <span className="choice__rec-use">
        Recommended: {rec.label}.{" "}
        <label className="choice__rec-go" htmlFor={choiceId(name, rec.value)}>
          Use it
        </label>
      </span>
    </span>
  );
}

/** The small tag on the recommended card. */
export const RecTag = () => <span className="pick-card__default">Recommended</span>;

export function Segmented({
  name,
  label,
  value,
  options,
  help,
}: {
  name: string;
  label: string;
  value: string;
  options: Choice[];
  help?: ReactNode;
}) {
  return (
    <fieldset className="choice">
      <legend className="choice__legend">{label}</legend>
      <div className="seg">
        {options.map((o) => (
          <label className="seg__opt" key={o.value}>
            <input
              className="seg__input"
              type="radio"
              id={choiceId(name, o.value)}
              name={name}
              value={o.value}
              defaultChecked={o.value === value}
              data-rec={o.recommended ? "" : undefined}
            />
            <span className="seg__label">{o.label}</span>
          </label>
        ))}
      </div>
      {help ? <span className="g-help">{help}</span> : null}
      <RecLine name={name} options={options} />
    </fieldset>
  );
}

export interface Level extends Choice {
  /** One line under the name: what this level means. */
  line: string;
}

export function LevelCards({
  name,
  label,
  value,
  options,
  help,
}: {
  name: string;
  label: string;
  value: string;
  /** Weakest first: the bars fill one more step per card. */
  options: Level[];
  help?: ReactNode;
}) {
  return (
    <fieldset className="choice">
      <legend className="choice__legend">{label}</legend>
      <div className="pick-cards pick-cards--level">
        {options.map((o, i) => (
          <label className="pick-card" key={o.value}>
            <input
              className="pick-card__input"
              type="radio"
              id={choiceId(name, o.value)}
              name={name}
              value={o.value}
              defaultChecked={o.value === value}
              data-rec={o.recommended ? "" : undefined}
            />
            <span className="pick-card__bars" aria-hidden="true">
              {options.map((b, j) => (
                <span key={b.value} className={`pick-card__bar${j <= i ? " is-on" : ""}`} />
              ))}
            </span>
            <span className="pick-card__name">
              {o.label}
              {o.recommended ? <RecTag /> : null}
            </span>
            <span className="pick-card__line">{o.line}</span>
          </label>
        ))}
      </div>
      {help ? <span className="g-help">{help}</span> : null}
      <RecLine name={name} options={options} />
    </fieldset>
  );
}

export interface Preset extends Choice {
  /** What it does, in a few words: "Lock, then unlock after 15 min". */
  does: string;
  /** Who it's for, in a sentence. */
  about: string;
}

export function PresetCards({
  name,
  label,
  value,
  options,
  help,
}: {
  name: string;
  label: string;
  value: string;
  options: Preset[];
  help?: ReactNode;
}) {
  return (
    <fieldset className="choice">
      <legend className="choice__legend">{label}</legend>
      <div className="pick-cards">
        {options.map((o) => (
          <label className="pick-card pick-card--preset" key={o.value}>
            <input
              className="pick-card__input"
              type="radio"
              id={choiceId(name, o.value)}
              name={name}
              value={o.value}
              defaultChecked={o.value === value}
              data-rec={o.recommended ? "" : undefined}
            />
            <span className="pick-card__name">
              {o.label}
              {o.recommended ? <RecTag /> : null}
            </span>
            <span className="pick-card__does">{o.does}</span>
            <span className="pick-card__line">{o.about}</span>
          </label>
        ))}
      </div>
      {help ? <span className="g-help">{help}</span> : null}
      <RecLine name={name} options={options} />
    </fieldset>
  );
}
