"use client";

import {
  ALERT_PROVIDERS,
  blankCard,
  STREAM_PANEL,
  STREAM_REQUEST_PROVIDERS,
} from "@garrison/db/cards";
import { useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardPreview, PreviewButtons } from "@/components/cards/CardPreview";
import { FormPreview } from "@/components/panels/FormPreview";
import { PanelWords } from "@/components/panels/PanelWords";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;
type Option = { id: string; name: string };

interface Props {
  guildId: string;
  saved: {
    enabled: boolean;
    reviewChannelId: string | null;
    alertChannelId: string | null;
    roleId: string | null;
    /** The panel's words as members see them now. */
    title: string;
    body: string;
  };
  channels: Option[];
  roles: Option[];
  action: Action;
  undo: Action;
  stamp: string;
}

const NO_NAMES = { roles: new Map<string, string>(), channels: new Map<string, string>() };

/**
 * Members asking for their stream, as a panel that saves itself: on or off, where requests go,
 * where approved streams announce and who they ping, and the request panel's words; beside it,
 * the panel and its form as members see them.
 */
export function StreamRequestsEditor(props: Props) {
  return (
    <AutoSaveCard
      id="requests"
      title="Members' streams"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save member requests"
    >
      <Fields {...props} />
    </AutoSaveCard>
  );
}

function Fields({ saved, channels, roles }: Props) {
  const [enabled, setEnabled] = useState(saved.enabled);
  const [review, setReview] = useState(saved.reviewChannelId ?? "");
  const [alert, setAlert] = useState(saved.alertChannelId ?? "");
  const [words, setWords] = useState({ title: saved.title, body: saved.body });
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify({ enabled, review, alert, words }));
  const blocked =
    enabled && !review
      ? "Pick the staff channel requests go to."
      : enabled && !alert
        ? "Pick where approved streams are announced."
        : null;
  const card = {
    ...blankCard(words.title.trim() || STREAM_PANEL.title),
    blocks: words.body.trim() ? [{ kind: "text" as const, text: words.body }] : [],
  };
  const pick = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    help: string,
  ) => (
    <label className="g-field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select
        className="g-input"
        id={id}
        name={id}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">Pick a channel</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
      <span className="g-help">{help}</span>
    </label>
  );

  return (
    <div ref={signal} className="editor-layout editor-layout--fit" data-hold={blocked ?? undefined}>
      <div className="editor-fields">
        <label className="switch">
          <input
            type="checkbox"
            name="requestsEnabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="switch__text">
            <span>Members can ask for their stream</span>
            <span className="g-help">
              Twitch, Kick or YouTube. Staff approve each one; approving adds it to the alerts
              above, within this server's alert limit.
            </span>
          </span>
        </label>
        {pick(
          "requestReviewChannelId",
          "Requests go to",
          review,
          setReview,
          "A staff-only channel: each request waits there with Add and Decline.",
        )}
        {pick(
          "requestAlertChannelId",
          "Approved streams announce in",
          alert,
          setAlert,
          "Like #streams. Staff can change one afterwards like any alert.",
        )}
        <label className="g-field" htmlFor="requestRoleId">
          <span className="field-label">And ping</span>
          <select
            className="g-input"
            id="requestRoleId"
            name="requestRoleId"
            defaultValue={saved.roleId ?? ""}
          >
            <option value="">Nobody</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="editor-group">
          <legend className="g-label">The request panel</legend>
          <PanelWords
            names={{ title: "requestPanelTitle", body: "requestPanelBody" }}
            value={words}
            onChange={(v) => setWords({ title: v.title, body: v.body })}
          />
        </fieldset>
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
          channel={null}
          names={NO_NAMES}
          controls={<PreviewButtons labels={[{ label: STREAM_PANEL.button, emoji: null }]} />}
        />
        <FormPreview
          title={STREAM_PANEL.button}
          fields={[
            {
              label: "Where you stream",
              required: true,
              choices: STREAM_REQUEST_PROVIDERS.map((p) => ALERT_PROVIDERS[p].label),
            },
            {
              label: "Your channel",
              required: true,
              help: "Your username, @handle or a link to your channel",
            },
            { label: "Anything staff should know?" },
          ]}
        />
      </div>
    </div>
  );
}
