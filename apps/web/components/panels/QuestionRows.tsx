"use client";

import { newQuestionId, VERIFY_LIMITS, type VerifyQuestion } from "@garrison/db/cards";
import { useState } from "react";

/**
 * A form's questions, edited in place: each question, the line under it, and whether it's
 * answered in a paragraph; add up to Discord's five, remove any but the last one left. Used by
 * every panel whose form a server writes (Suggestions).
 */
export function QuestionRows({
  rows,
  onChange,
  firstLabel,
  note,
}: {
  rows: VerifyQuestion[];
  onChange: (rows: VerifyQuestion[]) => void;
  /** What the first question is, for screen readers ("the idea itself"). */
  firstLabel?: string;
  /** Under the Add button: how many, and which are required. */
  note: string;
}) {
  // A question just added takes the cursor, ready to type.
  const [added, setAdded] = useState<string | null>(null);
  const set = (i: number, patch: Partial<VerifyQuestion>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      <ol className="counter-rows">
        {rows.map((q, i) => (
          <li className="counter-row" key={q.id}>
            <div className="counter-row__head">
              <span className="counter-row__num" aria-hidden="true">
                {i + 1}
              </span>
              <label className="g-field">
                <span className="sr-only">
                  Question {i + 1}
                  {i === 0 && firstLabel ? `, ${firstLabel}` : ""}
                </span>
                <input
                  className="g-input"
                  value={q.label}
                  maxLength={VERIFY_LIMITS.label}
                  // biome-ignore lint/a11y/noAutofocus: the question just added by the button below
                  autoFocus={q.id === added}
                  aria-invalid={!q.label.trim()}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
              </label>
              {rows.length > 1 ? (
                <button
                  type="button"
                  className="list-rows__remove"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
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
              ) : null}
            </div>
            <div className="counter-row__body">
              <label className="g-field">
                <span className="field-label">Line under it</span>
                <input
                  className="g-input"
                  value={q.help ?? ""}
                  maxLength={VERIFY_LIMITS.help}
                  onChange={(e) => set(i, { help: e.target.value || null })}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={q.long}
                  onChange={(e) => set(i, { long: e.target.checked })}
                />
                <span>A paragraph to answer</span>
              </label>
            </div>
          </li>
        ))}
      </ol>
      <div className="list-rows__foot">
        <button
          type="button"
          className="g-btn g-btn--secondary g-btn--sm"
          disabled={rows.length >= VERIFY_LIMITS.parts}
          onClick={() => {
            const id = newQuestionId();
            onChange([...rows, { id, label: "", help: null, long: false }]);
            setAdded(id);
          }}
        >
          Add a question
        </button>
        <span className="g-help">{note}</span>
      </div>
    </>
  );
}
