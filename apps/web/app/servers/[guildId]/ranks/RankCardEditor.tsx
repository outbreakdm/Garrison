"use client";

import {
  type Entitlements,
  isPresetBackground,
  isRankImage,
  lockedRankCard,
  newId,
  previewableImage,
  progressShare,
  RANK_BACKGROUNDS,
  RANK_CARD_LIMITS,
  RANK_DETAIL_SOURCES,
  type RankCardField,
  type RankCardStyle,
  type RankDetailSource,
  rankAccent,
  STANDARD_ACCENT,
} from "@garrison/db/cards";
import { useLayoutEffect, useRef, useState } from "react";
import { AutoSaveCard, useSaveSignal } from "@/components/AutoSave";
import { HexInput, move, ProNotice, ProTag, RowTools } from "@/components/cards/CardEditor";
import { HowItWorks } from "@/components/HowItWorks";
import type { AutoResult } from "@/lib/autosave";

type Action = (form: FormData) => Promise<AutoResult>;

interface Props {
  guildId: string;
  saved: RankCardStyle;
  ent: Entitlements;
  sampleName: string;
  planHref: string;
  action: Action;
  undo: Action;
  /** Changes whenever the saved card does: after an Undo, the editor starts again from it. */
  stamp: string;
}

/** The rank card as a panel that saves itself, its fields beside a preview of /rank. */
export function RankCardEditor(props: Props) {
  return (
    <AutoSaveCard
      id="card"
      title="Rank card"
      action={props.action}
      undo={props.undo}
      guildId={props.guildId}
      stamp={props.stamp}
      saveLabel="Save rank card"
      aside={<ProTag on={props.ent["ranks.cards"]} />}
    >
      <RankCardFields {...props} />
    </AutoSaveCard>
  );
}

/** A sample member for the preview: the signed-in moderator at a made-up level. */
const SAMPLE = { level: 12, position: 3, into: 640, needed: 1420, total: 9140 };

/**
 * The rank card's look and the details members fill in, beside a preview drawn
 * like the image /rank posts. Colors reach the preview through CSS variables set
 * from script (the dashboard's CSP has no inline styles).
 */
function RankCardFields({ saved, ent, sampleName, planHref }: Props) {
  const [style, setStyle] = useState<RankCardStyle>(saved);
  const set = (patch: Partial<RankCardStyle>) => setStyle((s) => ({ ...s, ...patch }));
  const usingImage = !isPresetBackground(style.background);
  const [imageUrl, setImageUrl] = useState(usingImage ? style.background : "");
  const locked = lockedRankCard(style, ent, saved);
  const imageOk =
    !usingImage || (isRankImage(style.background) && new URL(style.background).pathname.length > 1);
  const badLabel = style.fields.some((f) => !f.label.trim());
  const blocked = locked.length
    ? "Undo the Pro changes to save, or upgrade."
    : !imageOk
      ? "Use an image uploaded to Discord."
      : badLabel
        ? "Give each detail a label."
        : null;

  const undoPro = () =>
    setStyle((s) => ({
      background:
        s.background !== saved.background && s.background !== "garrison"
          ? saved.background
          : s.background,
      accent: s.accent !== saved.accent ? saved.accent : s.accent,
      fields: JSON.stringify(s.fields) !== JSON.stringify(saved.fields) ? saved.fields : s.fields,
      showLinked: s.showLinked && !saved.showLinked ? false : s.showLinked,
    }));

  // Every change tells the panel to save; adding or moving a detail has no input event.
  const signal = useSaveSignal<HTMLDivElement>(JSON.stringify(style));
  const card = useRef<HTMLDivElement>(null);
  const preset = isPresetBackground(style.background)
    ? RANK_BACKGROUNDS[style.background]
    : RANK_BACKGROUNDS.garrison;
  const shownImage = usingImage && previewableImage(style.background) ? style.background : null;
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--rc-from", preset?.from ?? "#0b0d10");
    el.style.setProperty("--rc-to", preset?.to ?? "#1a2028");
    el.style.setProperty("--rc-accent", rankAccent(style));
    el.style.setProperty("--rc-share", String(progressShare(SAMPLE.into, SAMPLE.needed)));
    el.style.setProperty("--rc-image", shownImage ? `url("${encodeURI(shownImage)}")` : "none");
  }, [preset, style, shownImage]);

  const sampleDetails = style.fields.map((f, i) => ({
    label: f.label || `Detail ${i + 1}`,
    value: f.from
      ? RANK_DETAIL_SOURCES[f.from].sample
      : f.hint || (["Holy Paladin", "Silvermoon", "Raid leader", "EU evenings"][i] ?? "…"),
  }));
  const setField = (i: number, patch: Partial<RankCardField>) =>
    set({ fields: style.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div ref={signal} className="editor-layout" data-hold={blocked ?? undefined}>
      <input type="hidden" name="card" value={JSON.stringify(style)} />
      <div className="editor-fields">
        <fieldset className="editor-group">
          <legend className="g-label">
            Background <ProTag on={ent["ranks.cards"]} />
          </legend>
          <div className="swatches" role="radiogroup" aria-label="Background">
            {Object.entries(RANK_BACKGROUNDS).map(([key, bg]) => (
              <label className="swatch" key={key}>
                <input
                  type="radio"
                  name="rc-background"
                  checked={style.background === key}
                  onChange={() => set({ background: key })}
                />
                <span
                  className="swatch__chip"
                  aria-hidden="true"
                  ref={(el) => {
                    el?.style.setProperty("--rc-from", bg.from);
                    el?.style.setProperty("--rc-to", bg.to);
                  }}
                />
                <span className="swatch__name">{bg.label}</span>
              </label>
            ))}
            <label className="swatch swatch--image">
              <input
                type="radio"
                name="rc-background"
                checked={usingImage}
                onChange={() => set({ background: imageUrl || "https://cdn.discordapp.com/" })}
              />
              <span className="swatch__chip" aria-hidden="true" />
              <span className="swatch__name">Your image</span>
            </label>
          </div>
          {usingImage ? (
            <label className="g-field" htmlFor="rc-image">
              <span>Image link</span>
              <input
                className={`g-input${imageOk ? "" : " g-input--invalid"}`}
                id="rc-image"
                type="url"
                inputMode="url"
                placeholder="https://cdn.discordapp.com/attachments/…"
                value={imageUrl}
                aria-invalid={!imageOk}
                onChange={(e) => {
                  setImageUrl(e.target.value.trim());
                  set({ background: e.target.value.trim() || "https://cdn.discordapp.com/" });
                }}
              />
              <span className={`g-help${imageOk ? "" : " g-help--error"}`}>
                Upload the image to any Discord channel, then copy its link. Garrison only fetches
                images from Discord. 1000 × 300 fits best.
              </span>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="editor-group">
          <legend className="g-label">
            Accent color <ProTag on={ent["ranks.cards"]} />
          </legend>
          <div className="color-field">
            <input
              type="color"
              className="color-field__swatch"
              aria-label="Pick the accent color"
              value={style.accent ?? STANDARD_ACCENT}
              onChange={(e) =>
                set({ accent: e.target.value === STANDARD_ACCENT ? null : e.target.value })
              }
            />
            <HexInput
              id="rc-accent"
              value={style.accent ?? STANDARD_ACCENT}
              onChange={(v) => set({ accent: v === STANDARD_ACCENT ? null : v })}
            />
            {style.accent ? (
              <button
                type="button"
                className="g-btn g-btn--ghost g-btn--sm"
                onClick={() => set({ accent: null })}
              >
                Use volt
              </button>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="editor-group">
          <legend className="g-label">
            Details on the card <ProTag on={ent["ranks.cards"]} />
          </legend>
          <p className="g-help">
            Up to {RANK_CARD_LIMITS.fields} short lines under the name, each a label and a value.
          </p>
          <HowItWorks>
            A value is typed by the member (with <code>/rankcard</code> or on their Account page) or
            read from a game account they share with this server, so it stays up to date.
          </HowItWorks>
          <div className="detail-list">
            {style.fields.map((f, i) => (
              <div className="detail-row" key={f.id}>
                <label className="g-field" htmlFor={`${f.id}-label`}>
                  <span className="field-label">Label</span>
                  <input
                    className="g-input"
                    id={`${f.id}-label`}
                    placeholder="Main, Realm, Class…"
                    value={f.label}
                    maxLength={RANK_CARD_LIMITS.label}
                    onChange={(e) => setField(i, { label: e.target.value })}
                  />
                </label>
                <label className="g-field" htmlFor={`${f.id}-from`}>
                  <span className="field-label">Filled in by</span>
                  <select
                    className="g-input"
                    id={`${f.id}-from`}
                    value={f.from ?? ""}
                    onChange={(e) => {
                      const from = (e.target.value || null) as RankDetailSource | null;
                      setField(i, {
                        from,
                        hint: from ? null : f.hint,
                        label: f.label || (from ? RANK_DETAIL_SOURCES[from].short : ""),
                      });
                    }}
                  >
                    <option value="">The member types it</option>
                    <optgroup label="From a linked game account">
                      {Object.entries(RANK_DETAIL_SOURCES).map(([key, src]) => (
                        <option key={key} value={key}>
                          {src.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                {f.from ? (
                  <p className="g-help detail-row__note">
                    Read from the first {RANK_DETAIL_SOURCES[f.from].label.split(" ")[0]} account
                    the member shares here. No account linked, no line.
                  </p>
                ) : (
                  <label className="g-field" htmlFor={`${f.id}-hint`}>
                    <span className="field-label">Example</span>
                    <input
                      className="g-input"
                      id={`${f.id}-hint`}
                      placeholder="Shown in the empty box, e.g. Holy Paladin"
                      value={f.hint ?? ""}
                      maxLength={RANK_CARD_LIMITS.hint}
                      onChange={(e) => setField(i, { hint: e.target.value || null })}
                    />
                  </label>
                )}
                <RowTools
                  index={i}
                  count={style.fields.length}
                  what={`detail ${i + 1}`}
                  onMove={(to) => set({ fields: move(style.fields, i, to) })}
                  onRemove={() => set({ fields: style.fields.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
          </div>
          <div className="editor-row">
            <button
              type="button"
              className="g-btn g-btn--secondary g-btn--sm"
              disabled={style.fields.length >= RANK_CARD_LIMITS.fields}
              onClick={() =>
                set({
                  fields: [...style.fields, { id: newId(), label: "", from: null, hint: null }],
                })
              }
            >
              Add detail
            </button>
            <span className="meter mono">
              {style.fields.length} / {RANK_CARD_LIMITS.fields}
            </span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={style.showLinked}
              onChange={(e) => set({ showLinked: e.target.checked })}
            />
            <span className="switch__text">
              <span className="field-label">
                Show game accounts members share <ProTag on={ent["ranks.cards"]} />
              </span>
              <span className="g-help">
                Only accounts a member chose to share with this server (Game accounts).
              </span>
            </span>
          </label>
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
          <span className="g-label">Preview of /rank</span>
          <span className="g-help">Updates as you type</span>
        </div>
        <div
          className={`rank-card${shownImage ? " rank-card--image" : ""}`}
          ref={card}
          role="img"
          aria-label={`Rank card for ${sampleName}: level ${SAMPLE.level}, rank ${SAMPLE.position}`}
        >
          <span className="rank-card__avatar" aria-hidden="true">
            {sampleName.slice(0, 1).toUpperCase()}
          </span>
          <span className="rank-card__name">{sampleName}</span>
          <span className="rank-card__stats">
            <span className="rank-card__label">Rank</span>
            <span className="rank-card__rank">#{SAMPLE.position}</span>
            <span className="rank-card__label">Level</span>
            <span className="rank-card__level">{SAMPLE.level}</span>
          </span>
          <span className="rank-card__details">
            {sampleDetails.map((d) => (
              <span key={d.label}>
                <span className="rank-card__label">{d.label}</span> {d.value}
              </span>
            ))}
            {style.showLinked && sampleDetails.length < 3 ? (
              <span className="rank-card__wide">OSRS · Zezima · total 2277 · combat 126</span>
            ) : null}
          </span>
          <span className="rank-card__xp">
            <span>{SAMPLE.total.toLocaleString("en-US")} XP total</span>
            <span>
              {SAMPLE.into.toLocaleString("en-US")} / {SAMPLE.needed.toLocaleString("en-US")} XP
            </span>
          </span>
          <span className="rank-card__bar" aria-hidden="true">
            <span />
          </span>
        </div>
        {usingImage && imageOk && !shownImage ? (
          <p className="g-help">
            This preview only loads images from cdn.discordapp.com. Discord will show yours.
          </p>
        ) : null}
      </div>
    </div>
  );
}
