"use client";

import {
  type CustomCard,
  type Entitlements,
  fillWelcome,
  lockedCardFields,
  WELCOME_PLACEHOLDERS,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { CardEditor, ProNotice, ProTag } from "@/components/cards/CardEditor";
import { CardPreview } from "@/components/cards/CardPreview";

type Action = (form: FormData) => Promise<void>;

/** A stand-in member for the preview: the person editing, as if they'd just joined. */
const SAMPLE_ID = "100000000000000000";

/**
 * One welcome card (join, leave or DM): on or off, where it goes, and the card,
 * with the preview filled in the way a real join would fill it.
 */
export function WelcomeCardForm({
  guildId,
  part,
  saved,
  ent,
  channels,
  roleNames,
  sample,
  locked: partLocked,
  planHref,
  action,
}: {
  guildId: string;
  part: "join" | "leave" | "dm";
  saved: { enabled: boolean; channelId: string | null; card: CustomCard };
  ent: Entitlements;
  channels: { id: string; name: string }[];
  roleNames: [string, string][];
  sample: { name: string; server: string };
  /** The whole part is Pro and this server doesn't have it (the DM on Free). */
  locked: boolean;
  planHref: string;
  action: Action;
}) {
  const [enabled, setEnabled] = useState(saved.enabled);
  const [channelId, setChannelId] = useState(saved.channelId ?? "");
  const [card, setCard] = useState(saved.card);
  const dirty =
    enabled !== saved.enabled ||
    channelId !== (saved.channelId ?? "") ||
    JSON.stringify(card) !== JSON.stringify(saved.card);

  const names = useMemo(
    () => ({
      roles: new Map(roleNames),
      channels: new Map(channels.map((c) => [c.id, c.name])),
    }),
    [roleNames, channels],
  );
  const filled = fillWelcome(
    card,
    { userId: SAMPLE_ID, name: sample.name, server: sample.server, count: 128 },
    { mention: part !== "leave" },
  );

  const lockedCard = lockedCardFields(card, ent, saved.card);
  const lockedLabels = [
    ...lockedCard.map((f) => f.label),
    ...(partLocked && enabled && !saved.enabled ? ["The welcome DM"] : []),
  ];
  const undoPro = () => {
    const next = { ...card };
    for (const f of lockedCard) next[f.key] = saved.card[f.key];
    setCard(next);
    if (partLocked && !saved.enabled) setEnabled(false);
  };
  const needsChannel = part !== "dm" && enabled && !channelId;
  const blocked = lockedLabels.length
    ? "Undo the Pro changes to save, or upgrade."
    : needsChannel
      ? "Pick a channel, or turn it off."
      : null;
  const id = (n: string) => `${part}-${n}`;

  return (
    <form action={action}>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="part" value={part} />
      <input type="hidden" name="card" value={JSON.stringify(card)} />
      <div className="editor-layout">
        <div className="editor-fields">
          <div className="field-row">
            <label className="switch">
              <input
                type="checkbox"
                name="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="switch__text">
                <span className="field-label">
                  {part === "join"
                    ? "Post when someone joins"
                    : part === "leave"
                      ? "Post when someone leaves"
                      : "DM each new member"}
                  {part === "dm" ? <ProTag on={!partLocked} /> : null}
                </span>
                <span className="g-help">
                  {part === "dm"
                    ? "Skipped for members whose DMs are closed."
                    : "Skipped during a raid or lockdown, and past 10 a minute."}
                </span>
              </span>
            </label>
            {part !== "dm" ? (
              <label className="g-field" htmlFor={id("channel")}>
                <span>Channel</span>
                <select
                  className="g-input"
                  id={id("channel")}
                  name="channelId"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                >
                  <option value="">Pick a channel</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <CardEditor
            card={card}
            onChange={setCard}
            idPrefix={part}
            plan={{
              accent: ent["cards.accent"],
              images: ent["cards.images"],
              footer: ent["cards.footer"],
            }}
          />
          <p className="g-help">
            Placeholders:{" "}
            {WELCOME_PLACEHOLDERS.filter((p) => part !== "leave" || p.token !== "{user}").map(
              (p, i) => (
                <span key={p.token}>
                  {i ? ", " : ""}
                  <code className="placeholder">{p.token}</code> {p.about}
                </span>
              ),
            )}
            {part === "leave" ? ". They've left, so {user} becomes their name." : "."}
          </p>

          <ProNotice labels={lockedLabels} onReset={undoPro} planHref={planHref} />
          <div className="form-foot">
            <button
              type="submit"
              className="g-btn g-btn--primary"
              disabled={Boolean(blocked) || !dirty}
            >
              Save
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
            <span className="g-help">As if you just {part === "leave" ? "left" : "joined"}</span>
          </div>
          <CardPreview
            card={filled}
            channel={part === "dm" ? "Direct message" : (names.channels.get(channelId) ?? null)}
            names={names}
          />
        </div>
      </div>
    </form>
  );
}
