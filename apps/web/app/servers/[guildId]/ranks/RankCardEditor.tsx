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
  type RankCardStyle,
  rankAccent,
  STANDARD_ACCENT,
} from "@garrison/db/cards";
import { useLayoutEffect, useRef, useState } from "react";
import { HexInput, move, ProNotice, ProTag, RowTools } from "@/components/cards/CardEditor";

type Action = (form: FormData) => Promise<void>;

/** A sample member for the preview: the signed-in moderator at a made-up level. */
const SAMPLE = { level: 12, position: 3, into: 640, needed: 1420, total: 9140 };

/**
 * The rank card's look and the details members fill in, beside a preview drawn
 * like the image /rank posts. Colours reach the preview through CSS variables set
 * from script (the dashboard's CSP has no inline styles).
 */
export function RankCardEditor({
  guildId,
  saved,
  ent,
  sampleName,
  planHref,
  action,
}: {
  guildId: string;
  saved: RankCardStyle;
  ent: Entitlements;
  sampleName: string;
  planHref: string;
  action: Action;
}) {
  const [style, setStyle] = useState<RankCardStyle>(saved);
  const set = (patch: Partial<RankCardStyle>) => setStyle((s) => ({ ...s, ...patch }));
  const usingImage = !isPresetBackground(style.background);
  const [imageUrl, setImageUrl] = useState(usingImage ? style.background : "");
  const dirty = JSON.stringify(style) !== JSON.stringify(saved);
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
    value: ["Holy Paladin", "Silvermoon", "Raid leader", "EU evenings"][i] ?? "…",
  }));

  return (
    <form action={action}>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="card" value={JSON.stringify(style)} />
      <div className="editor-layout">
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
              Accent colour <ProTag on={ent["ranks.cards"]} />
            </legend>
            <div className="colour-field">
              <input
                type="color"
                className="colour-field__swatch"
                aria-label="Pick the accent colour"
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
              Details members fill in <ProTag on={ent["ranks.cards"]} />
            </legend>
            <p className="g-help">
              Like Main, Realm or Role. Members write theirs with <code>/rankcard</code>; the card
              shows what they've filled in.
            </p>
            <div className="option-list">
              {style.fields.map((f, i) => (
                <div className="option option--detail" key={f.id}>
                  <input
                    className="g-input"
                    aria-label={`Detail ${i + 1}`}
                    placeholder="Label, like Main"
                    value={f.label}
                    maxLength={RANK_CARD_LIMITS.label}
                    onChange={(e) =>
                      set({
                        fields: style.fields.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
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
                onClick={() => set({ fields: [...style.fields, { id: newId(), label: "" }] })}
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
                  Only accounts a member chose to share with this server's roster (Barracks).
                </span>
              </span>
            </label>
          </fieldset>

          <ProNotice labels={locked} onReset={undoPro} planHref={planHref} />
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary" disabled={Boolean(blocked)}>
              Save rank card
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
    </form>
  );
}
