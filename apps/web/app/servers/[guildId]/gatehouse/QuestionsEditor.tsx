"use client";

import {
  newQuestionId,
  questionRoom,
  VERIFY_LIMITS,
  type VerifyQuestion,
} from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { DiscordMarkdown } from "@/components/cards/markdown";
import { Switch } from "@/components/settings";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;

interface Props {
  guildId: string;
  questions: VerifyQuestion[];
  intro: string | null;
  review: boolean;
  channelId: string | null;
  channels: { id: string; name: string }[];
  /** Verification is off (no role): the questions wait until it's on. */
  off: boolean;
  action: Action;
  undo: Action;
  stamp: string;
}

const NO_NAMES = { roles: new Map<string, string>(), channels: new Map<string, string>() };

/** The questions as a panel that saves itself, beside Discord's form as members see it. */
export function QuestionsEditor(props: Props) {
  return (
    <AutoSaveCard
      id="questions"
      title="Questions"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save questions"
    >
      <QuestionFields {...props} />
    </AutoSaveCard>
  );
}

function QuestionFields({
  questions: saved,
  intro: savedIntro,
  review,
  channelId,
  channels,
  off,
}: Props) {
  const [rows, setRows] = useState<VerifyQuestion[]>(saved);
  const [intro, setIntro] = useState(savedIntro ?? "");
  const [channel, setChannel] = useState(channelId ?? "");
  // A question just added takes the cursor, ready to type.
  const [added, setAdded] = useState<string | null>(null);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(rows));
  const room = questionRoom(intro);
  const set = (i: number, patch: Partial<VerifyQuestion>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const blocked = rows.some((r) => !r.label.trim())
    ? "Give each question its question."
    : rows.length > room
      ? "Discord's form holds the intro and four questions: remove one, or the intro."
      : rows.length && !channel
        ? "Pick the staff channel the answers go to."
        : null;

  return (
    <div ref={signal} className="editor-layout editor-layout--fit" data-hold={blocked ?? undefined}>
      <input type="hidden" name="verifyQuestions" value={JSON.stringify(rows)} />
      <div className="editor-fields">
        <p className="g-help">
          New members answer these before they get the verified role: in Discord's form when they
          press Verify, or on the website.
          {off ? " Verification is off: pick its role above first." : ""}
        </p>
        <label className="g-field" htmlFor="verifyIntro">
          <span className="field-label">Intro</span>
          <textarea
            className="g-input"
            id="verifyIntro"
            name="verifyIntro"
            rows={3}
            maxLength={VERIFY_LIMITS.intro}
            value={intro}
            placeholder="Welcome! A few quick questions so we know who's joining."
            onChange={(e) => setIntro(e.target.value)}
          />
          <span className="g-help">
            At the top of the form, with Discord's formatting: **bold**, *italic*, lists, links. It
            takes one of the form's five places.
          </span>
        </label>

        {rows.length ? (
          <ol className="counter-rows">
            {rows.map((q, i) => (
              <li className="counter-row" key={q.id}>
                <div className="counter-row__head">
                  <span className="counter-row__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <label className="g-field">
                    <span className="sr-only">Question {i + 1}</span>
                    <input
                      className="g-input"
                      value={q.label}
                      maxLength={VERIFY_LIMITS.label}
                      placeholder="What is your in-game name?"
                      // biome-ignore lint/a11y/noAutofocus: the question just added by the button beside it
                      autoFocus={q.id === added}
                      aria-invalid={!q.label.trim()}
                      onChange={(e) => set(i, { label: e.target.value })}
                    />
                  </label>
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
                </div>
                <div className="counter-row__body">
                  <label className="g-field">
                    <span className="field-label">Line under it</span>
                    <input
                      className="g-input"
                      value={q.help ?? ""}
                      maxLength={VERIFY_LIMITS.help}
                      placeholder="Exactly as it shows in the game"
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
        ) : null}
        <div className="list-rows__foot">
          <button
            type="button"
            className="g-btn g-btn--secondary g-btn--sm"
            disabled={rows.length >= room}
            onClick={() => {
              const id = newQuestionId();
              setRows([...rows, { id, label: "", help: null, long: false }]);
              setAdded(id);
            }}
          >
            Add a question
          </button>
          <span className="g-help">
            {rows.length} of {room}
            {intro.trim() ? " beside the intro" : ""}
          </span>
        </div>

        <label className="g-field" htmlFor="verifyAnswersChannelId">
          <span className="field-label">Answers go to</span>
          <select
            className="g-input"
            id="verifyAnswersChannelId"
            name="verifyAnswersChannelId"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">Pick a staff channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
          <span className="g-help">
            Only staff should see it: answers are posted there, and kept 30 days.
          </span>
        </label>
        <Switch
          name="verifyReview"
          defaultChecked={review}
          label="Staff approve each member"
          help="The answers card gets Approve and Deny; the role waits for Approve. Off: answering is enough."
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
          <span className="g-help">Live preview</span>
        </div>
        <figure className="dc dc-form">
          <figcaption className="sr-only">Discord's form, as members see it</figcaption>
          <p className="dc-form__title">Before you join</p>
          {intro.trim() ? (
            <div className="dc-form__intro">
              <DiscordMarkdown text={intro} names={NO_NAMES} />
            </div>
          ) : null}
          {rows.length ? (
            rows.map((q, i) => (
              <div className="dc-form__field" key={q.id}>
                <span className="dc-form__label">
                  {q.label.trim() || `Question ${i + 1}`}
                  <span className="dc-form__req" aria-hidden="true">
                    *
                  </span>
                </span>
                {q.help ? <span className="dc-form__help">{q.help}</span> : null}
                <span className={q.long ? "dc-form__box dc-form__box--long" : "dc-form__box"} />
              </div>
            ))
          ) : (
            <p className="dc-form__empty">Add a question and it shows here.</p>
          )}
          <div className="dc-form__foot">
            <span className="dc-form__cancel">Cancel</span>
            <span className="dc-form__submit">Submit</span>
          </div>
        </figure>
      </div>
    </div>
  );
}
