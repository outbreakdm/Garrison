"use client";

import {
  answerMax,
  blankCard,
  newQuestionId,
  SUGGESTION_LIMITS,
  SUGGESTION_PANEL,
  VERIFY_LIMITS,
  type VerifyQuestion,
} from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardPreview, PreviewButtons } from "@/components/cards/CardPreview";
import { Switch } from "@/components/settings";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;

interface Props {
  guildId: string;
  /** The panel as members see it now: the server's words, or the standard ones. */
  saved: { title: string; body: string; button: string; questions: VerifyQuestion[] };
  sticky: boolean;
  /** Where suggestions are posted, for the preview's channel name. */
  channel: string | null;
  action: Action;
  undo: Action;
  stamp: string;
}

const NO_NAMES = { roles: new Map<string, string>(), channels: new Map<string, string>() };

/**
 * The suggestions panel as a panel that saves itself: its title, text and button, the form
 * the button opens, and whether it follows the cards down the channel; beside it, the panel
 * and the form as members see them.
 */
export function PanelEditor(props: Props) {
  return (
    <AutoSaveCard
      id="panel"
      title="Suggestion panel"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save the panel"
    >
      <PanelFields {...props} />
    </AutoSaveCard>
  );
}

function PanelFields({ saved, sticky, channel }: Props) {
  const [title, setTitle] = useState(saved.title);
  const [body, setBody] = useState(saved.body);
  const [button, setButton] = useState(saved.button);
  const [rows, setRows] = useState<VerifyQuestion[]>(saved.questions);
  // A question just added takes the cursor, ready to type.
  const [added, setAdded] = useState<string | null>(null);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify({ title, body, button, rows }));
  const set = (i: number, patch: Partial<VerifyQuestion>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const blocked = rows.some((r) => !r.label.trim())
    ? "Give each question its question."
    : !button.trim()
      ? "Give the button a label."
      : null;

  const card = {
    ...blankCard(title.trim() || SUGGESTION_PANEL.title),
    blocks: body.trim() ? [{ kind: "text" as const, text: body }] : [],
  };

  return (
    <div ref={signal} className="editor-layout editor-layout--fit" data-hold={blocked ?? undefined}>
      <input type="hidden" name="questions" value={JSON.stringify(rows)} />
      <div className="editor-fields">
        <p className="g-help">
          Post it in your suggestions channel: its button opens a form, and each answer becomes a
          card members vote on. /suggest opens the same form.
        </p>
        <label className="g-field" htmlFor="panelTitle">
          <span className="field-label">Title</span>
          <input
            className="g-input"
            id="panelTitle"
            name="panelTitle"
            maxLength={SUGGESTION_LIMITS.panelTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="g-field" htmlFor="panelBody">
          <span className="field-label">Text</span>
          <textarea
            className="g-input"
            id="panelBody"
            name="panelBody"
            rows={3}
            maxLength={SUGGESTION_LIMITS.panelBody}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="g-field" htmlFor="buttonLabel">
          <span className="field-label">Button</span>
          <input
            className="g-input"
            id="buttonLabel"
            name="buttonLabel"
            maxLength={SUGGESTION_LIMITS.button}
            value={button}
            aria-invalid={!button.trim()}
            onChange={(e) => setButton(e.target.value)}
          />
        </label>

        <fieldset className="editor-group">
          <legend className="g-label">The form</legend>
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
                      {i === 0 ? ", the idea itself" : ""}
                    </span>
                    <input
                      className="g-input"
                      value={q.label}
                      maxLength={VERIFY_LIMITS.label}
                      placeholder={i === 0 ? "Your idea" : "Who would use it?"}
                      // biome-ignore lint/a11y/noAutofocus: the question just added by the button beside it
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
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
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
                setRows([...rows, { id, label: "", help: null, long: false }]);
                setAdded(id);
              }}
            >
              Add a question
            </button>
            <span className="g-help">
              {rows.length} of {VERIFY_LIMITS.parts}. The first is the idea and must be answered;
              the rest are optional.
            </span>
          </div>
        </fieldset>

        <Switch
          name="panelSticky"
          defaultChecked={sticky}
          label="Keep the panel at the bottom"
          help="Garrison posts it again under each new suggestion in its channel, so it's always the last message."
        />
        {blocked ? (
          <p className="g-help g-help--warn" role="status">
            {blocked} Nothing saves until then.
          </p>
        ) : null}
      </div>

      <div className="preview-pane">
        <div className="preview-pane__head">
          <span className="g-label">In Discord</span>
          <span className="g-help">The panel, then its form</span>
        </div>
        <CardPreview
          card={card}
          channel={channel}
          names={NO_NAMES}
          controls={<PreviewButtons labels={[{ label: button.trim() || "Label", emoji: null }]} />}
        />
        <figure className="dc dc-form">
          <figcaption className="sr-only">Discord's form, as members see it</figcaption>
          <p className="dc-form__title">{button.trim() || SUGGESTION_PANEL.button}</p>
          {rows.map((q, i) => (
            <div className="dc-form__field" key={q.id}>
              <span className="dc-form__label">
                {q.label.trim() || `Question ${i + 1}`}
                {i === 0 ? (
                  <span className="dc-form__req" aria-hidden="true">
                    *
                  </span>
                ) : null}
              </span>
              {q.help ? <span className="dc-form__help">{q.help}</span> : null}
              <span
                className={q.long ? "dc-form__box dc-form__box--long" : "dc-form__box"}
                title={`Up to ${answerMax(q)} characters`}
              />
            </div>
          ))}
          <div className="dc-form__foot">
            <span className="dc-form__cancel">Cancel</span>
            <span className="dc-form__submit">Submit</span>
          </div>
        </figure>
      </div>
    </div>
  );
}
