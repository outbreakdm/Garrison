"use client";

import {
  type Entitlements,
  type LinkButton,
  lockedCardFields,
  MESSAGE_LIMITS,
  parseDiscordLink,
  type Repeat,
  restoreLockedCard,
  type SavedMessage,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardEditor, move, ProNotice, ProTag, RowTools } from "@/components/cards/CardEditor";
import { CardPreview, PreviewLinkButtons } from "@/components/cards/CardPreview";
import type { AutoResult } from "@/lib/autosave";
import type { PostTarget } from "@/lib/discord";

type Action = (form: FormData) => Promise<void>;
type SaveAction = (form: FormData) => Promise<AutoResult>;
type When = "off" | Repeat;

const WHEN: [When, string][] = [
  ["off", "Not scheduled"],
  ["none", "Once"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

/** The destinations, grouped the way Discord lists them: channels, forums, threads. */
function TargetOptions({ targets, extra }: { targets: PostTarget[]; extra: string | null }) {
  const text = targets.filter((t) => t.kind === "text");
  const forums = targets.filter((t) => t.kind === "forum");
  const threads = targets.filter((t) => t.kind === "thread");
  return (
    <>
      {extra ? <option value={extra}>A thread from a link</option> : null}
      <optgroup label="Channels">
        {text.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </optgroup>
      {forums.length ? (
        <optgroup label="Forums: a new post each time">
          {forums.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {threads.length ? (
        <optgroup label="Threads">
          {threads.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.parent ? ` (in ${c.parent})` : ""}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

/** Tomorrow at 20:00, as a datetime-local value: a sensible first pick. */
const tomorrowEvening = () => {
  const d = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T20:00`;
};

interface Props {
  guildId: string;
  saved: SavedMessage;
  ent: Entitlements;
  /** Text channels, forums and open threads. */
  channels: PostTarget[];
  roleNames: [string, string][];
  tz: string;
  nextSend: string | null;
  paused: boolean;
  planHref: string;
  saveAction: SaveAction;
  undoAction: SaveAction;
  removeAction: Action;
  requestAction: Action;
  /** Changes whenever the saved message does: after an Undo, the editor starts again from it. */
  stamp: string;
}

/**
 * One saved message, saving itself as you write: the card, link buttons, and where and
 * when it goes, beside the preview. The toolbar's Post now is its own request and sends
 * the saved message; it rests while a save is on its way.
 */
export function MessageEditor(props: Props) {
  const { guildId, saved, channels, saveAction, undoAction, removeAction, requestAction, stamp } =
    props;
  const [postIn, setPostIn] = useState(saved.channelId ?? channels[0]?.id ?? "");
  return (
    <AutoSaveCard
      id={`msg-${saved.id}`}
      title={saved.name}
      action={saveAction}
      undo={undoAction}
      guildId={guildId}
      stamp={stamp}
      saveLabel={`Save ${saved.name}`}
      bare
      aside={
        <span className="post-bar">
          <form action={requestAction} className="post-bar__form">
            <input type="hidden" name="guildId" value={guildId} />
            <input type="hidden" name="page" value="dispatch" />
            <input type="hidden" name="kind" value="post_message" />
            <input type="hidden" name="messageId" value={saved.id} />
            <label className="sr-only" htmlFor={`${saved.id}-post`}>
              Post now in
            </label>
            <select
              className="g-input g-input--sm"
              id={`${saved.id}-post`}
              name="channelId"
              value={postIn}
              onChange={(e) => setPostIn(e.target.value)}
            >
              <TargetOptions
                targets={channels}
                extra={postIn && !channels.some((c) => c.id === postIn) ? postIn : null}
              />
            </select>
            <button
              type="submit"
              className="g-btn g-btn--primary g-btn--sm post-bar__send"
              disabled={!postIn}
            >
              Post now
            </button>
          </form>
          <details className="confirm post-bar__update">
            <summary className="confirm__toggle g-btn g-btn--ghost g-btn--sm">
              Update a post…
            </summary>
            <form action={requestAction} className="post-bar__form">
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="page" value="dispatch" />
              <input type="hidden" name="kind" value="post_message" />
              <input type="hidden" name="messageId" value={saved.id} />
              <label className="sr-only" htmlFor={`${saved.id}-edit`}>
                Link to the message to update
              </label>
              <input
                className="g-input g-input--sm mono"
                id={`${saved.id}-edit`}
                name="editLink"
                required
                placeholder="Paste its message link"
                autoComplete="off"
              />
              <button type="submit" className="g-btn g-btn--secondary g-btn--sm">
                Update it
              </button>
            </form>
            <span className="g-help">
              A message Garrison posted from here: it changes in place to this one.
            </span>
          </details>
          <details className="confirm">
            <summary className="confirm__toggle g-btn g-btn--ghost g-btn--sm">Remove…</summary>
            <form action={removeAction}>
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="messageId" value={saved.id} />
              <button type="submit" className="g-btn g-btn--danger g-btn--sm">
                Yes, remove it
              </button>
            </form>
          </details>
        </span>
      }
    >
      <MessageFields {...props} onChannel={(id) => id && setPostIn(id)} />
    </AutoSaveCard>
  );
}

function MessageFields({
  saved,
  ent,
  channels,
  roleNames,
  tz,
  nextSend,
  paused,
  planHref,
  onChannel,
}: Props & { onChannel: (id: string) => void }) {
  const [m, setM] = useState<SavedMessage>(saved);
  const postIn = saved.channelId ?? channels[0]?.id ?? "";
  const set = (patch: Partial<SavedMessage>) => setM((x) => ({ ...x, ...patch }));
  const setButtons = (buttons: LinkButton[]) => set({ buttons });
  const dirty = JSON.stringify(m) !== JSON.stringify(saved);
  const id = (n: string) => `${saved.id}-${n}`;
  // Every change tells the panel to save; buttons (add a link, move a field) change it
  // without an input event.
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(m));
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
  const target = channels.find((c) => c.id === m.channelId) ?? null;
  const forum = target?.kind === "forum";
  const [link, setLink] = useState("");
  const linked = link.trim() ? parseDiscordLink(link) : null;
  const badButton = m.buttons.some((b) => !b.label.trim() || !/^https:\/\/\S+$/.test(b.url));
  const blocked = locked.length
    ? "Undo the Pro changes to save, or upgrade."
    : badButton
      ? "Each link button needs a label and an https:// link."
      : forum && !m.forumPost?.title.trim()
        ? "Give the forum post a title."
        : m.schedule && !m.channelId
          ? "Pick a channel to schedule it in."
          : m.schedule && !m.schedule.at
            ? "Pick a date and time."
            : null;

  return (
    <div ref={signal} className="editor-layout" data-hold={blocked ?? undefined}>
      <input type="hidden" name="message" value={JSON.stringify(m)} />
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
              <span>Where</span>
              <select
                className="g-input"
                id={id("channel")}
                value={m.channelId ?? ""}
                onChange={(e) => {
                  set({ channelId: e.target.value || null });
                  onChannel(e.target.value);
                }}
              >
                <option value="">Pick a channel</option>
                <TargetOptions
                  targets={channels}
                  extra={m.channelId && !target ? m.channelId : null}
                />
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
          <label className="g-field" htmlFor={id("link")}>
            <span className="field-label">Or a thread by its link</span>
            <span className="link-field">
              <input
                className="g-input mono"
                id={id("link")}
                value={link}
                placeholder="https://discord.com/channels/…"
                autoComplete="off"
                aria-invalid={Boolean(link.trim() && !linked)}
                onChange={(e) => setLink(e.target.value)}
              />
              <button
                type="button"
                className="g-btn g-btn--secondary g-btn--sm"
                disabled={!linked}
                onClick={() => {
                  if (!linked) return;
                  set({ channelId: linked.channelId });
                  onChannel(linked.channelId);
                  setLink("");
                }}
              >
                Use it
              </button>
            </span>
            <span className="g-help">
              For a thread or post that isn't open right now: in Discord, right-click it and Copy
              Link. Posting opens it again.
            </span>
          </label>
          {forum ? (
            <div className="forum-post">
              <label className="g-field" htmlFor={id("post-title")}>
                <span className="field-label">Post title</span>
                <input
                  className="g-input"
                  id={id("post-title")}
                  value={m.forumPost?.title ?? ""}
                  maxLength={MESSAGE_LIMITS.postTitle}
                  placeholder="What the post is called in the forum"
                  aria-invalid={!m.forumPost?.title.trim()}
                  onChange={(e) =>
                    set({
                      forumPost: { title: e.target.value, tagIds: m.forumPost?.tagIds ?? [] },
                    })
                  }
                />
              </label>
              {target?.tags.length ? (
                <fieldset className="tag-picks">
                  <legend className="field-label">
                    Tags <span className="muted">up to {MESSAGE_LIMITS.postTags}</span>
                  </legend>
                  {target.tags.map((t) => {
                    const on = m.forumPost?.tagIds.includes(t.id) ?? false;
                    const full = (m.forumPost?.tagIds.length ?? 0) >= MESSAGE_LIMITS.postTags;
                    return (
                      <label className="tag-pick" key={t.id}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!on && full}
                          onChange={(e) => {
                            const tags = m.forumPost?.tagIds ?? [];
                            set({
                              forumPost: {
                                title: m.forumPost?.title ?? "",
                                tagIds: e.target.checked
                                  ? [...tags, t.id]
                                  : tags.filter((x) => x !== t.id),
                              },
                            });
                          }}
                        />
                        <span className="tag-pick__chip">{t.name}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
              <p className="g-help">Each send starts a new post in {target?.name}.</p>
            </div>
          ) : null}
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
        {blocked && !locked.length ? (
          <p className="g-help g-help--warn" role="status">
            {blocked} Nothing saves until then.
          </p>
        ) : null}
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
            m.buttons.length ? <PreviewLinkButtons labels={m.buttons.map((b) => b.label)} /> : null
          }
        />
      </div>
    </div>
  );
}
