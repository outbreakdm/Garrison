"use client";

import {
  blankCard,
  SUGGESTION_PANEL,
  VERIFY_LIMITS,
  type VerifyQuestion,
} from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardPreview, PreviewButtons } from "@/components/cards/CardPreview";
import { FormPreview } from "@/components/panels/FormPreview";
import { PanelWords } from "@/components/panels/PanelWords";
import { QuestionRows } from "@/components/panels/QuestionRows";
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
  const [words, setWords] = useState({
    title: saved.title,
    body: saved.body,
    button: saved.button,
  });
  const [rows, setRows] = useState<VerifyQuestion[]>(saved.questions);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify({ words, rows }));
  const button = words.button?.trim() ?? "";
  const blocked = rows.some((r) => !r.label.trim())
    ? "Give each question its question."
    : !button
      ? "Give the button a label."
      : null;

  const card = {
    ...blankCard(words.title.trim() || SUGGESTION_PANEL.title),
    blocks: words.body.trim() ? [{ kind: "text" as const, text: words.body }] : [],
  };

  return (
    <div ref={signal} className="editor-layout editor-layout--fit" data-hold={blocked ?? undefined}>
      <input type="hidden" name="questions" value={JSON.stringify(rows)} />
      <div className="editor-fields">
        <p className="g-help">
          Post it in your suggestions channel: its button opens a form, and each answer becomes a
          card members vote on. /suggest opens the same form.
        </p>
        <PanelWords
          names={{ title: "panelTitle", body: "panelBody", button: "buttonLabel" }}
          value={words}
          onChange={(v) => setWords({ ...words, ...v, button: v.button ?? "" })}
        />
        <fieldset className="editor-group">
          <legend className="g-label">The form</legend>
          <QuestionRows
            rows={rows}
            onChange={setRows}
            firstLabel="the idea itself"
            note={`${rows.length} of ${VERIFY_LIMITS.parts}. The first is the idea and must be answered; the rest are optional.`}
          />
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
          controls={<PreviewButtons labels={[{ label: button || "Label", emoji: null }]} />}
        />
        <FormPreview
          title={button || SUGGESTION_PANEL.button}
          fields={rows.map((q, i) => ({
            label: q.label.trim() || `Question ${i + 1}`,
            help: q.help,
            long: q.long,
            required: i === 0,
          }))}
        />
      </div>
    </div>
  );
}
