"use client";

import { blankCard, LFG_PANEL, LFG_PANEL_BUTTONS, parseSlots } from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardPreview, PreviewButtons } from "@/components/cards/CardPreview";
import { FormPreview, type FormPreviewField } from "@/components/panels/FormPreview";
import { PanelWords } from "@/components/panels/PanelWords";
import { Switch } from "@/components/settings";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;

/** What the editor needs of a template. */
export interface PanelTemplate {
  id: string;
  name: string;
  game: string | null;
  roles: string | null;
  size: number | null;
  /** Channels it may be posted in, by name; empty: any. */
  channels: string[];
}

interface Props {
  guildId: string;
  /** The panel's words as members see them now: the server's, or the standard ones. */
  saved: { title: string; body: string };
  templates: PanelTemplate[];
  /** Templates with a button, as saved (every template, up to the limit, when none are picked). */
  picked: string[];
  other: boolean;
  sticky: boolean;
  /** The channel the panel is in, or would usually go, for the preview. */
  channel: string | null;
  action: Action;
  undo: Action;
  stamp: string;
}

const NO_NAMES = { roles: new Map<string, string>(), channels: new Map<string, string>() };

/** A template's form, as members will see it (apps/bot rally/panel.ts lfgForm). */
function formFor(t: PanelTemplate | null): FormPreviewField[] {
  const slots = t ? parseSlots(t.roles, t.size) : null;
  const roles = slots?.ok ? slots.value.map((g) => g.name).filter(Boolean) : [];
  return [
    { label: "What are you running?", required: true, value: t?.name ?? null },
    ...(roles.length > 1 ? [{ label: "Your role", required: true, choices: roles }] : []),
    ...(t
      ? []
      : [
          {
            label: "How many players?",
            help: "A number with you included, or roles: Tank 1, Healer 1, DPS 3",
          },
        ]),
    { label: "When does it start?", help: "Leave it empty for now, or say how long from now" },
    { label: "Anything to know?" },
  ];
}

/**
 * The LFG panel as a panel that saves itself: its words, which templates get a button, the
 * "Something else" button and whether it follows the groups down the channel; beside it, the
 * panel and the first button's form as members see them.
 */
export function LfgPanelEditor(props: Props) {
  return (
    <AutoSaveCard
      id="lfg-panel"
      title="LFG panel"
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

function PanelFields({
  saved,
  templates,
  picked: savedPicked,
  other: savedOther,
  sticky,
  channel,
}: Props) {
  const [words, setWords] = useState({ title: saved.title, body: saved.body });
  const [picked, setPicked] = useState<string[]>(savedPicked);
  const [other, setOther] = useState(savedOther);
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify({ words, picked, other }));
  // In the server's order, as the panel shows them.
  const shown = templates.filter((t) => picked.includes(t.id));
  const full = picked.length >= LFG_PANEL_BUTTONS;
  const blocked =
    !shown.length && !other ? "Pick a template, or keep the Something else button." : null;
  const first = shown[0] ?? null;

  const card = {
    ...blankCard(words.title.trim() || LFG_PANEL.title),
    blocks: words.body.trim() ? [{ kind: "text" as const, text: words.body }] : [],
  };

  return (
    <div ref={signal} className="editor-layout editor-layout--fit" data-hold={blocked ?? undefined}>
      <input
        type="hidden"
        name="lfgPanelTemplates"
        value={JSON.stringify(shown.map((t) => t.id))}
      />
      <div className="editor-fields">
        <p className="g-help">
          Post it in your LFG channel. Each button opens a short form for that template, and the
          group goes up in the same channel with its Join buttons.
        </p>
        <PanelWords
          names={{ title: "lfgPanelTitle", body: "lfgPanelBody" }}
          value={words}
          onChange={(v) => setWords({ title: v.title, body: v.body })}
        />
        <fieldset className="editor-group">
          <legend className="g-label">Buttons</legend>
          {templates.length ? (
            <div className="checklist__box">
              {templates.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <label className="checklist__item" key={t.id}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && full}
                      onChange={(e) =>
                        setPicked(
                          e.target.checked ? [...picked, t.id] : picked.filter((id) => id !== t.id),
                        )
                      }
                    />
                    <span>
                      {t.name}
                      {t.game ? <span className="muted"> · {t.game}</span> : null}
                      {t.channels.length ? (
                        <span className="muted">
                          {" "}
                          · only in {t.channels.map((c) => `#${c}`).join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="g-help">
              No templates yet. Add them on the Templates tab and they get buttons here; until then
              the panel has the {LFG_PANEL.other} button.
            </p>
          )}
          <span className="g-help">
            Up to {LFG_PANEL_BUTTONS}. A template limited to other channels doesn't show on a panel
            posted elsewhere.
          </span>
          <label className="switch">
            <input
              type="checkbox"
              name="lfgPanelOther"
              checked={other}
              onChange={(e) => setOther(e.target.checked)}
            />
            <span className="switch__text">
              <span>“{LFG_PANEL.other}” button</span>
              <span className="g-help">
                For a group no template fits: its form asks how many players, or which roles.
              </span>
            </span>
          </label>
        </fieldset>
        <Switch
          name="lfgPanelSticky"
          defaultChecked={sticky}
          label="Keep the panel at the bottom"
          help="Garrison posts it again under each new group in its channel, so it's always the last message."
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
          <span className="g-help">
            The panel, then {first ? `${first.name}'s` : `${LFG_PANEL.other}'s`} form
          </span>
        </div>
        <CardPreview
          card={card}
          channel={channel}
          names={NO_NAMES}
          controls={
            <PreviewButtons
              labels={[
                ...shown.map((t) => ({ label: t.name, emoji: null })),
                ...(other ? [{ label: LFG_PANEL.other, emoji: null }] : []),
              ]}
            />
          }
        />
        <FormPreview title={first?.name ?? "Find a group"} fields={formFor(first)} />
      </div>
    </div>
  );
}
