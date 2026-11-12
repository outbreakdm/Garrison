"use client";

import {
  CARD_PRO_FIELDS,
  type Entitlements,
  isCustomEmoji,
  isEmoji,
  lockedCardFields,
  newCustomEmoji,
  newId,
  TICKET_LIMITS,
  type TicketPanel,
  type TicketTopic,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { CardEditor, move, ProNotice, ProTag, RowTools } from "@/components/cards/CardEditor";
import { CardPreview, PreviewButtons } from "@/components/cards/CardPreview";
import { EmojiInput, type ServerEmojiChoice } from "@/components/cards/EmojiInput";

type Action = (form: FormData) => Promise<void>;

const sameQuestions = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One ticket panel: the card (shared editor), its topics (one button each, with
 * an optional form on Pro), and the Discord preview. Saving sends the whole panel
 * as JSON; posting is a separate request, so Discord only ever gets the saved panel.
 */
export function TicketPanelEditor({
  guildId,
  saved,
  ent,
  channels,
  roleNames,
  postedIn,
  paused,
  planHref,
  saveAction,
  removeAction,
  requestAction,
  serverEmoji,
}: {
  guildId: string;
  saved: TicketPanel;
  ent: Entitlements;
  channels: { id: string; name: string }[];
  roleNames: { id: string; name: string }[];
  postedIn: string | null;
  paused: boolean;
  planHref: string;
  saveAction: Action;
  removeAction: Action;
  requestAction: Action;
  serverEmoji: ServerEmojiChoice[];
}) {
  const [panel, setPanel] = useState<TicketPanel>(saved);
  const [channelId, setChannelId] = useState(postedIn ?? channels[0]?.id ?? "");
  const set = (patch: Partial<TicketPanel>) => setPanel((p) => ({ ...p, ...patch }));
  const setTopics = (topics: TicketTopic[]) => set({ topics });
  const dirty = JSON.stringify(panel) !== JSON.stringify(saved);
  const id = (name: string) => `${saved.id}-${name}`;
  const names = useMemo(
    () => ({
      roles: new Map(roleNames.map((r) => [r.id, r.name])),
      channels: new Map(channels.map((c) => [c.id, c.name])),
    }),
    [roleNames, channels],
  );

  const limit = ent["tickets.topics"];
  const lockedCard = lockedCardFields(panel.card, ent, saved.card);
  const formLocked =
    !ent["tickets.forms"] &&
    panel.topics.some((t) => {
      const was = saved.topics.find((s) => s.id === t.id);
      return t.questions.length > 0 && !sameQuestions(t.questions, was?.questions ?? []);
    });
  const emojiLocked =
    !ent["emoji.custom"] &&
    newCustomEmoji(
      panel.topics.map((t) => t.emoji),
      saved.topics.map((t) => t.emoji),
    ).length > 0;
  const topicsLocked = panel.topics.length > limit && panel.topics.length > saved.topics.length;
  const locked = [
    ...lockedCard.map((f) => f.label),
    ...(formLocked ? ["A form before a ticket opens"] : []),
    ...(topicsLocked ? [`More than ${limit} topics`] : []),
    ...(emojiLocked ? ["A server emoji"] : []),
  ];
  const undoPro = () =>
    setPanel((p) => {
      const card = { ...p.card };
      for (const f of CARD_PRO_FIELDS)
        if (lockedCard.some((l) => l.key === f.key)) card[f.key] = saved.card[f.key];
      const topics = p.topics
        .map((t) => {
          const was = saved.topics.find((s) => s.id === t.id);
          const kept = formLocked ? { ...t, questions: was?.questions ?? [] } : t;
          return emojiLocked && isCustomEmoji(kept.emoji)
            ? { ...kept, emoji: was?.emoji ?? null }
            : kept;
        })
        .slice(0, topicsLocked ? Math.max(limit, saved.topics.length) : undefined);
      return { ...p, card, topics };
    });

  const badEmoji = panel.topics.some((t) => t.emoji && !isEmoji(t.emoji));
  const longQuestion = panel.topics.some((t) =>
    t.questions.some((q) => q.length > TICKET_LIMITS.question),
  );
  const blocked = locked.length
    ? "Undo the Pro changes to save, or upgrade."
    : badEmoji
      ? "Fix the emoji to save."
      : longQuestion
        ? `Questions can be ${TICKET_LIMITS.question} characters.`
        : null;
  const channelName = names.channels.get(channelId) ?? null;
  const postedHere = postedIn !== null && postedIn === channelId;
  const postLabel = postedHere
    ? `Update in #${channelName}`
    : postedIn
      ? `Move to #${channelName ?? "channel"}`
      : `Post in #${channelName ?? "channel"}`;
  const cantPost = paused
    ? "This panel is paused: the server has more panels than its plan runs."
    : !saved.topics.length
      ? "Add a topic and save before posting."
      : dirty
        ? "Save first: Discord gets the saved panel."
        : null;
  const shown = panel.topics.slice(0, limit);

  return (
    <div className="menu-editor">
      <form action={saveAction}>
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="panel" value={JSON.stringify(panel)} />
        <div className="editor-layout">
          <div className="editor-fields">
            <label className="g-field" htmlFor={id("name")}>
              <span>Panel name</span>
              <input
                className="g-input"
                id={id("name")}
                value={panel.name}
                maxLength={TICKET_LIMITS.name}
                required
                onChange={(e) => set({ name: e.target.value })}
              />
              <span className="g-help">Only the dashboard shows this. Members see the card.</span>
            </label>

            <CardEditor
              card={panel.card}
              onChange={(card) => set({ card })}
              idPrefix={saved.id}
              plan={{
                accent: ent["cards.accent"],
                images: ent["cards.images"],
                footer: ent["cards.footer"],
              }}
            />

            <fieldset className="editor-group">
              <legend className="g-label">Topics</legend>
              <p className="g-help">
                Each topic is a button under the card. The ticket channel shows which one the member
                picked.
              </p>
              <div className="option-list">
                {panel.topics.map((t, i) => {
                  const emojiOk = !t.emoji || isEmoji(t.emoji);
                  const update = (patch: Partial<TicketTopic>) =>
                    setTopics(panel.topics.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div className="option option--topic" key={t.id}>
                      <input
                        className="g-input option__label"
                        aria-label={`Label for topic ${i + 1}`}
                        placeholder="Label, like Get help"
                        value={t.label}
                        maxLength={TICKET_LIMITS.label}
                        required
                        onChange={(e) => update({ label: e.target.value })}
                      />
                      <EmojiInput
                        label={`Emoji for topic ${i + 1}`}
                        value={t.emoji}
                        serverEmoji={serverEmoji}
                        onChange={(emoji) => update({ emoji })}
                      />
                      <RowTools
                        index={i}
                        count={panel.topics.length}
                        what={`topic ${i + 1}`}
                        onMove={(to) => setTopics(move(panel.topics, i, to))}
                        onRemove={() => setTopics(panel.topics.filter((_, j) => j !== i))}
                      />
                      <label className="g-field option__desc" htmlFor={id(`q-${t.id}`)}>
                        <span className="field-label">
                          Questions before it opens <ProTag on={ent["tickets.forms"]} />
                        </span>
                        <textarea
                          className="g-input"
                          id={id(`q-${t.id}`)}
                          rows={2}
                          placeholder="One per line, up to 5. Leave empty to open straight away."
                          value={t.questions.join("\n")}
                          onChange={(e) =>
                            update({
                              questions: e.target.value
                                .split("\n")
                                .slice(0, TICKET_LIMITS.questions)
                                .map((q) => q.slice(0, 60)),
                            })
                          }
                          onBlur={() =>
                            update({ questions: t.questions.map((q) => q.trim()).filter(Boolean) })
                          }
                        />
                      </label>
                      {i >= limit ? (
                        <p className="g-help g-help--warn option__note">
                          Free panels show {limit} topics, so this one is paused.
                        </p>
                      ) : null}
                      {!emojiOk ? (
                        <p className="g-help g-help--error option__note">
                          Use one emoji, like 🎫, or type one of this server's as :name:.
                        </p>
                      ) : null}
                      {t.questions.some((q) => q.length > TICKET_LIMITS.question) ? (
                        <p className="g-help g-help--error option__note">
                          Discord's form labels hold {TICKET_LIMITS.question} characters.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="editor-row">
                <button
                  type="button"
                  className="g-btn g-btn--secondary g-btn--sm"
                  disabled={panel.topics.length >= 10}
                  onClick={() =>
                    setTopics([
                      ...panel.topics,
                      { id: newId(), label: "", emoji: null, questions: [] },
                    ])
                  }
                >
                  Add topic
                </button>
                <span className="meter mono">
                  {panel.topics.length} / {limit}
                </span>
              </div>
            </fieldset>

            <ProNotice labels={locked} onReset={undoPro} planHref={planHref} />
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--primary" disabled={Boolean(blocked)}>
                Save {panel.name.trim() || "panel"}
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
              card={panel.card}
              channel={channelName}
              names={names}
              controls={
                <PreviewButtons
                  labels={shown.map((t) => ({ label: t.label || "Topic", emoji: t.emoji }))}
                />
              }
            />
          </div>
        </div>
      </form>

      <div className="menu-editor__foot">
        <form action={requestAction} className="post-form">
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="page" value="parley" />
          <input type="hidden" name="kind" value="post_ticket_panel" />
          <input type="hidden" name="panelId" value={saved.id} />
          <label className="g-field" htmlFor={id("channel")}>
            <span>{postedIn ? "Posted in" : "Post in"}</span>
            <select
              className="g-input"
              id={id("channel")}
              name="channelId"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                  {c.id === postedIn ? " (posted here)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="g-btn g-btn--secondary"
            disabled={Boolean(cantPost) || !channelId}
          >
            {postLabel}
          </button>
          <span className="g-help">
            {cantPost ??
              (postedIn && !postedHere
                ? "Moving posts it in the new channel and deletes the old message."
                : "Garrison posts it as itself. Each press is checked against the saved panel.")}
          </span>
        </form>
        <form action={removeAction}>
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="panelId" value={saved.id} />
          <button type="submit" className="g-btn g-btn--ghost">
            Remove {saved.name}
          </button>
        </form>
      </div>
    </div>
  );
}
