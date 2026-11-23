import type { ReactNode } from "react";
import { RecUse } from "./RecUse";

/**
 * Choices shown, not typed: a pick among a few is a row or a set of cards, never a select.
 * All three are radios under the drawing, so they post like a select, work before scripts
 * load, and a form that saves itself sees each pick as a change.
 *
 * - Segmented: a few short actions in one row (what happens to a flagged message).
 * - LevelCards: a scale, weakest to strongest, with a line under each (how strict).
 * - PresetCards: whole setups with a sentence each (how to answer a raid).
 *
 * One option can be Garrison's recommendation (its setting for a new server). Its card or
 * segment is marked; a line under the choice appears only while something else is picked:
 * "Recommended: Balanced. Use it", where Use it is a button that picks that radio.
 */

export interface Choice {
  value: string;
  label: string;
  /** Garrison's recommendation, and its setting for a new server. */
  recommended?: boolean;
}

/** The radio's id, so "Use it" can point at it. Names are unique on a page. */
export const choiceId = (name: string, value: string) => `choice-${name}-${value}`;

/**
 * Under a choice that's off Garrison's recommendation: what it recommends, and a way back.
 * Hidden by CSS while the recommended option is picked (its own tag already says so), so it
 * follows the radios the moment you pick, before and after scripts load.
 */
export function RecLine({ name, options }: { name: string; options: Choice[] }) {
  const rec = options.find((o) => o.recommended);
  if (!rec) return null;
  return (
    <span className="choice__rec">
      Recommended: {rec.label}. <RecUse target={choiceId(name, rec.value)} />
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
