"use client";

import {
  type CustomCard,
  type Entitlements,
  fillWelcome,
  lockedCardFields,
  restoreLockedCard,
  WELCOME_PLACEHOLDERS,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { CardEditor, ProNotice, ProTag } from "@/components/cards/CardEditor";
import { CardPreview } from "@/components/cards/CardPreview";
import { WelcomeBannerView } from "@/components/cards/WelcomeBannerView";
import type { AutoResult } from "@/lib/autosave";
import { usePickedWelcomeImage } from "./WelcomeImage";

type Action = (form: FormData) => Promise<AutoResult>;

/** A stand-in member for the preview: the person editing, as if they'd just joined. */
const SAMPLE_ID = "100000000000000000";
/** The member number the preview shows, in the card's text and on the welcome image. */
const SAMPLE_COUNT = 128;

const TITLES = { join: "Welcome card", leave: "Leave card", dm: "Welcome DM" } as const;

interface Props {
  guildId: string;
  part: "join" | "leave" | "dm";
  saved: { enabled: boolean; channelId: string | null; card: CustomCard };
  ent: Entitlements;
  channels: { id: string; name: string }[];
  roleNames: [string, string][];
  /** The person editing, as the preview's new member: their name here and their avatar. */
  sample: { name: string; server: string; avatar: string | null };
  /** The whole part is Pro and this server doesn't have it (the DM on Free). */
  locked: boolean;
  planHref: string;
  action: Action;
  undo: Action;
  /** Changes whenever the saved card does: after an Undo, the editor starts again from it. */
  stamp: string;
}

/**
 * One welcome card (join, leave or DM) as a panel that saves itself: on or off, where it
 * goes, and the card, beside a preview filled in the way a real join would fill it.
 */
export function WelcomeCardForm(props: Props) {
  const { part, guildId, action, undo, stamp, locked } = props;
  return (
    <AutoSaveCard
      id={part}
      title={TITLES[part]}
      action={action}
      undo={undo}
      guildId={guildId}
      stamp={stamp}
      saveLabel={`Save the ${TITLES[part].toLowerCase()}`}
      aside={part === "dm" ? <ProTag on={!locked} /> : null}
    >
      <WelcomeCardFields {...props} />
    </AutoSaveCard>
  );
}

function WelcomeCardFields({
  part,
  saved,
  ent,
  channels,
  roleNames,
  sample,
  locked: partLocked,
  planHref,
}: Props) {
  const [enabled, setEnabled] = useState(saved.enabled);
  const [channelId, setChannelId] = useState(saved.channelId ?? "");
  const [card, setCard] = useState(saved.card);
  // The welcome image picked in its own panel below, drawn into the card as the bot sends it.
  const picked = usePickedWelcomeImage();
  const banner = part === "join" && ent["welcome.image"] ? picked : null;

  const names = useMemo(
    () => ({
      roles: new Map(roleNames),
      channels: new Map(channels.map((c) => [c.id, c.name])),
    }),
    [roleNames, channels],
  );
  const filled = fillWelcome(
    card,
    { userId: SAMPLE_ID, name: sample.name, server: sample.server, count: SAMPLE_COUNT },
    { mention: part !== "leave" },
  );

  const lockedCard = lockedCardFields(card, ent, saved.card);
  const lockedLabels = [
    ...lockedCard.map((f) => f.label),
    ...(partLocked && enabled && !saved.enabled ? ["The welcome DM"] : []),
  ];
  const undoPro = () => {
    setCard(restoreLockedCard(card, saved.card, lockedCard));
    if (partLocked && !saved.enabled) setEnabled(false);
  };
  const needsChannel = part !== "dm" && enabled && !channelId;
  const blocked = lockedLabels.length
    ? "Undo the Pro changes to save, or upgrade."
    : needsChannel
      ? "Pick a channel, or turn it off."
      : null;
  // Every change to the card tells the panel to save; buttons (add a field, pick an image)
  // change it without an input event.
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify({ enabled, channelId, card }));
  const id = (n: string) => `${part}-${n}`;

  return (
    <div ref={signal} className="editor-layout" data-hold={blocked ?? undefined}>
      <input type="hidden" name="part" value={part} />
      <input type="hidden" name="card" value={JSON.stringify(card)} />
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
          vars={WELCOME_PLACEHOLDERS.map((p) => ({
            key: p.token.slice(1, -1),
            label: p.token.slice(1, -1).replace(/^./, (c) => c.toUpperCase()),
            about: part === "leave" && p.token === "{user}" ? "their name (they've left)" : p.about,
          }))}
          plan={{
            accent: ent["cards.accent"],
            images: ent["cards.images"],
            footer: ent["cards.footer"],
            embed: ent["cards.embed"],
          }}
        />
        <p className="g-help">
          Type @ to add:{" "}
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
        {needsChannel && !lockedLabels.length ? (
          <p className="g-help g-help--warn" role="status">
            Pick a channel, or turn it off. Nothing saves until then.
          </p>
        ) : null}
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
          media={
            banner !== null ? (
              <WelcomeBannerView
                background={banner}
                accent={card.accent}
                name={sample.name}
                server={sample.server}
                count={SAMPLE_COUNT}
                avatar={sample.avatar}
              />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
