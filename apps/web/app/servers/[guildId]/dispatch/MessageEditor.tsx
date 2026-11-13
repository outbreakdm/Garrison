"use client";

import {
  type Entitlements,
  type LinkButton,
  lockedCardFields,
  MESSAGE_LIMITS,
  type Repeat,
  restoreLockedCard,
  type SavedMessage,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { CardEditor, move, ProNotice, ProTag, RowTools } from "@/components/cards/CardEditor";
import { CardPreview, PreviewLinkButtons } from "@/components/cards/CardPreview";

type Action = (form: FormData) => Promise<void>;
type When = "off" | Repeat;

const WHEN: [When, string][] = [
  ["off", "Not scheduled"],
  ["none", "Once"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

/** Tomorrow at 20:00, as a datetime-local value: a sensible first pick. */
const tomorrowEvening = () => {
  const d = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T20:00`;
};

/**
 * One saved message: the card, optional link buttons, and where and when it
 * goes, with the preview beside it. "Post now" is its own request and always
 * sends the saved message, never unsaved edits.
 */
export function MessageEditor({
  guildId,
  saved,
  ent,
  channels,
  roleNames,
  tz,
  nextSend,
  paused,
  planHref,
  saveAction,
  removeAction,
  requestAction,
}: {
  guildId: string;
  saved: SavedMessage;
  ent: Entitlements;
  channels: { id: string; name: string }[];
  roleNames: [string, string][];
  tz: string;
  nextSend: string | null;
  paused: boolean;
  planHref: string;
  saveAction: Action;
  removeAction: Action;
  requestAction: Action;
}) {
  const [m, setM] = useState<SavedMessage>(saved);
  const [postIn, setPostIn] = useState(saved.channelId ?? channels[0]?.id ?? "");
  const set = (patch: Partial<SavedMessage>) => setM((x) => ({ ...x, ...patch }));
  const setButtons = (buttons: LinkButton[]) => set({ buttons });
  const dirty = JSON.stringify(m) !== JSON.stringify(saved);
  const id = (n: string) => `${saved.id}-${n}`;
  const when: When = m.schedule ? m.schedule.repeat : "off";

  const names = useMemo(
    () => ({ roles: new Map(roleNames), channels: new Map(channels.map((c) => [c.id, c.name])) }),
    [roleNames, channels],
  );

  const lockedCard = lockedCardFields(m.card, ent, saved.card);
  const extras = ent["messages.extras"];
  const buttonsLocked =
    !extras && m.buttons.length > 0 && JSON.stringify(m.buttons) !== JSON.stringify(saved.buttons);
  const repeatLocked =
    !extras && when !== "off" && when !== "none" && when !== saved.schedule?.repeat;
  const locked = [
    ...lockedCard.map((f) => f.label),
    ...(buttonsLocked ? ["A link button"] : []),
    ...(repeatLocked ? ["A repeating schedule"] : []),
  ];
  const undoPro = () =>
    setM((x) => {
      const card = restoreLockedCard(x.card, saved.card, lockedCard);
      return {
        ...x,
        card,
        buttons: buttonsLocked ? saved.buttons : x.buttons,
        schedule: repeatLocked ? saved.schedule : x.schedule,
      };
    });
  const badButton = m.buttons.some((b) => !b.label.trim() || !/^https:\/\/\S+$/.test(b.url));
  const blocked = locked.length
    ? "Undo the Pro changes to save, or upgrade."
    : badButton
      ? "Each link button needs a label and an https:// link."
      : m.schedule && !m.channelId
        ? "Pick a channel to schedule it in."
        : m.schedule && !m.schedule.at
          ? "Pick a date and time."
          : null;

  return (
    <div className="menu-editor">
      <form action={saveAction}>
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="message" value={JSON.stringify(m)} />
        <div className="editor-layout">
          <div className="editor-fields">
            <label className="g-field" htmlFor={id("name")}>
              <span>Name</span>
              <input
                className="g-input"
                id={id("name")}
                value={m.name}
                maxLength={MESSAGE_LIMITS.name}
                required
                onChange={(e) => set({ name: e.target.value })}
              />
              <span className="g-help">Only the dashboard shows this.</span>
            </label>

            <CardEditor
              card={m.card}
              onChange={(card) => set({ card })}
              idPrefix={saved.id}
              plan={{
                accent: ent["cards.accent"],
                images: ent["cards.images"],
                footer: ent["cards.footer"],
                embed: ent["cards.embed"],
              }}
            />

            <fieldset className="editor-group">
              <legend className="g-label">Link buttons</legend>
              <div className="option-list">
                {m.buttons.map((b, i) => {
                  const update = (patch: Partial<LinkButton>) =>
                    setButtons(m.buttons.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: buttons have no IDs; order is the identity
                    <div className="option option--link" key={i}>
                      <input
                        className="g-input"
                        aria-label={`Button ${i + 1} label`}
                        placeholder="Label"
                        value={b.label}
                        maxLength={MESSAGE_LIMITS.label}
                        onChange={(e) => update({ label: e.target.value })}
                      />
                      <input
                        className="g-input"
                        aria-label={`Button ${i + 1} link`}
                        type="url"
                        inputMode="url"
                        placeholder="https://…"
                        value={b.url}
                        maxLength={MESSAGE_LIMITS.url}
                        onChange={(e) => update({ url: e.target.value.trim() })}
                      />
                      <RowTools
                        index={i}
                        count={m.buttons.length}
                        what={`button ${i + 1}`}
                        onMove={(to) => setButtons(move(m.buttons, i, to))}
                        onRemove={() => setButtons(m.buttons.filter((_, j) => j !== i))}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="editor-row">
                <button
                  type="button"
                  className="g-btn g-btn--secondary g-btn--sm"
                  disabled={m.buttons.length >= MESSAGE_LIMITS.buttons}
                  onClick={() => setButtons([...m.buttons, { label: "", url: "" }])}
                >
                  Add link button
                </button>
                <ProTag on={extras} />
                <span className="meter mono">
                  {m.buttons.length} / {MESSAGE_LIMITS.buttons}
                </span>
              </div>
            </fieldset>

            <fieldset className="editor-group">
              <legend className="g-label">Where and when</legend>
              <div className="field-row">
                <label className="g-field" htmlFor={id("channel")}>
                  <span>Channel</span>
                  <select
                    className="g-input"
                    id={id("channel")}
                    value={m.channelId ?? ""}
                    onChange={(e) => {
                      set({ channelId: e.target.value || null });
                      if (e.target.value) setPostIn(e.target.value);
                    }}
                  >
                    <option value="">Pick a channel</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {m.schedule ? (
                  <label className="g-field" htmlFor={id("at")}>
                    <span>{when === "none" ? "Send at" : "Starting"}</span>
                    <input
                      className="g-input mono"
                      id={id("at")}
                      type="datetime-local"
                      value={m.schedule.at}
                      onChange={(e) =>
                        set({
                          schedule: { repeat: when === "off" ? "none" : when, at: e.target.value },
                        })
                      }
                    />
                  </label>
                ) : null}
              </div>
              <div className="segmented" role="radiogroup" aria-label="Schedule">
                {WHEN.map(([value, label]) => (
                  <label className="segmented__item" key={value}>
                    <input
                      type="radio"
                      name={id("when")}
                      checked={when === value}
                      onChange={() =>
                        set({
                          schedule:
                            value === "off"
                              ? null
                              : { at: m.schedule?.at || tomorrowEvening(), repeat: value },
                        })
                      }
                    />
                    <span>
                      {label}
                      {!extras && (value === "daily" || value === "weekly") ? " · Pro" : ""}
                    </span>
                  </label>
                ))}
              </div>
              <p className="g-help">
                Times are in {tz} (Settings → Server).
                {paused ? " This schedule is paused: the server has more than its plan runs." : ""}
                {!paused && nextSend && !dirty ? ` Next send: ${nextSend}.` : ""}
              </p>
            </fieldset>

            <ProNotice labels={locked} onReset={undoPro} planHref={planHref} />
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--primary" disabled={Boolean(blocked)}>
                Save {m.name.trim() || "message"}
              </button>
              <span className="g-help">
                {blocked ? <strong className="unsaved">{blocked} </strong> : null}
                {dirty && !blocked ? <strong className="unsaved">Unsaved changes. </strong> : null}
                Recorded in <a href={`/servers/${guildId}/settings#history`}>Settings history</a>,
                where it can be undone.
              </span>
            </div>
          </div>

          <div className="preview-pane">
            <div className="preview-pane__head">
              <span className="g-label">Preview in Discord</span>
              <span className="g-help">Updates as you type</span>
            </div>
            <CardPreview
              card={m.card}
              channel={names.channels.get(m.channelId ?? postIn) ?? null}
              names={names}
              controls={
                m.buttons.length ? (
                  <PreviewLinkButtons labels={m.buttons.map((b) => b.label)} />
                ) : null
              }
            />
          </div>
        </div>
      </form>

      <div className="menu-editor__foot">
        <form action={requestAction} className="post-form">
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="page" value="dispatch" />
          <input type="hidden" name="kind" value="post_message" />
          <input type="hidden" name="messageId" value={saved.id} />
          <label className="g-field" htmlFor={id("post")}>
            <span>Post now in</span>
            <select
              className="g-input"
              id={id("post")}
              name="channelId"
              value={postIn}
              onChange={(e) => setPostIn(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="g-btn g-btn--secondary" disabled={dirty || !postIn}>
            Post now
          </button>
          <span className="g-help">
            {dirty
              ? "Save first: Discord gets the saved message."
              : "Posts a copy right away; the schedule is unchanged."}
          </span>
        </form>
        <form action={removeAction}>
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="messageId" value={saved.id} />
          <button type="submit" className="g-btn g-btn--ghost">
            Remove {saved.name}
          </button>
        </form>
      </div>
    </div>
  );
}
