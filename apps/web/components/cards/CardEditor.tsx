"use client";

import {
  CARD_LIMITS,
  type CardBlock,
  type CustomCard,
  cardTextLength,
  STANDARD_ACCENT,
} from "@garrison/db/cards";
import { type ReactNode, useEffect, useState } from "react";

/**
 * The shared card editor: every part of a card, field by field. Controlled: the
 * module that owns the card (role menus, later the message builder) keeps the
 * value, draws the preview beside it and saves it.
 *
 * Pro controls stay usable on Free, marked with a Pro tag, so people can see the
 * look in the preview. Saving a Pro value on Free is refused on the server; the
 * owner shows `ProNotice` above its save button.
 */

export interface CardPlan {
  accent: boolean;
  images: boolean;
  footer: boolean;
}

type FooterMode = "standard" | "custom" | "none";
const footerMode = (f: string | null): FooterMode =>
  f === null ? "standard" : f === "" ? "none" : "custom";

export function ProTag({ on }: { on: boolean }) {
  return on ? null : (
    <span className="g-badge pro-tag" title="Part of Garrison Pro">
      Pro
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

const Up = () => <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />;
const Down = () => <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />;
const Cross = () => <path d="m4 4 8 8M12 4l-8 8" />;

/** Move, add and remove items in a list without touching the others. */
export const move = <T,>(list: T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

/** The controls at the end of a row: move up, move down, remove. */
export function RowTools({
  index,
  count,
  what,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  what: string;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="row-tools">
      <IconButton
        label={`Move ${what} up`}
        onClick={() => onMove(index - 1)}
        disabled={index === 0}
      >
        <Up />
      </IconButton>
      <IconButton
        label={`Move ${what} down`}
        onClick={() => onMove(index + 1)}
        disabled={index === count - 1}
      >
        <Down />
      </IconButton>
      <IconButton label={`Remove ${what}`} onClick={onRemove}>
        <Cross />
      </IconButton>
    </div>
  );
}

/** A #rrggbb field that lets you type freely and only reports whole colours. */
function HexInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft.trim());
  return (
    <input
      className={`g-input mono colour-field__hex${valid ? "" : " g-input--invalid"}`}
      id={id}
      value={draft}
      maxLength={7}
      spellCheck={false}
      aria-invalid={!valid}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = e.target.value.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(v)) onChange(v);
      }}
      onBlur={() => setDraft(value)}
    />
  );
}

export function CardEditor({
  card,
  onChange,
  plan,
  idPrefix,
}: {
  card: CustomCard;
  onChange: (card: CustomCard) => void;
  plan: CardPlan;
  /** Keeps field IDs unique when several editors share a page. */
  idPrefix: string;
}) {
  const set = (patch: Partial<CustomCard>) => onChange({ ...card, ...patch });
  const setBlocks = (blocks: CardBlock[]) => set({ blocks });
  const used = cardTextLength(card);
  const full = card.blocks.length >= CARD_LIMITS.blocks;
  const id = (name: string) => `${idPrefix}-${name}`;
  const mode = footerMode(card.footer);
  let textCount = 0;

  return (
    <>
      <fieldset className="editor-group">
        <legend className="g-label">Card</legend>
        <label className="g-field" htmlFor={id("title")}>
          <span>Title</span>
          <input
            className="g-input"
            id={id("title")}
            value={card.title}
            maxLength={CARD_LIMITS.title}
            required
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <div className="block-list">
          {card.blocks.map((block, i) => {
            const what = block.kind === "divider" ? "divider" : `text ${++textCount}`;
            const tools = (
              <RowTools
                key="tools"
                index={i}
                count={card.blocks.length}
                what={what}
                onMove={(to) => setBlocks(move(card.blocks, i, to))}
                onRemove={() => setBlocks(card.blocks.filter((_, j) => j !== i))}
              />
            );
            return block.kind === "divider" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no IDs; order is the identity
              <div className="block block--divider" key={i}>
                <span className="block__rule" aria-hidden="true" />
                <span className="g-help">Divider</span>
                {tools}
              </div>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above
              <div className="block" key={i}>
                <textarea
                  className="g-input block__text"
                  aria-label={`Text ${textCount}`}
                  value={block.text}
                  maxLength={CARD_LIMITS.block}
                  rows={3}
                  onChange={(e) =>
                    setBlocks(
                      card.blocks.map((b, j) =>
                        j === i ? { kind: "text", text: e.target.value } : b,
                      ),
                    )
                  }
                />
                {tools}
              </div>
            );
          })}
        </div>
        <div className="editor-row">
          <button
            type="button"
            className="g-btn g-btn--secondary g-btn--sm"
            disabled={full}
            onClick={() => setBlocks([...card.blocks, { kind: "text", text: "" }])}
          >
            Add text
          </button>
          <button
            type="button"
            className="g-btn g-btn--ghost g-btn--sm"
            disabled={full || !card.blocks.length}
            onClick={() => setBlocks([...card.blocks, { kind: "divider" }])}
          >
            Add divider
          </button>
          <span className={`meter mono${used > CARD_LIMITS.text * 0.9 ? " meter--near" : ""}`}>
            {used.toLocaleString()} / {CARD_LIMITS.text.toLocaleString()}
          </span>
        </div>
        <p className="g-help">
          Discord formatting works: <code>**bold**</code>, <code>*italic*</code>,{" "}
          <code>- lists</code>, <code>## headings</code>, <code>-# small text</code> and{" "}
          <code>[links](https://…)</code>. Mentions show but never ping.
          {full ? ` A card holds ${CARD_LIMITS.blocks} parts.` : ""}
        </p>
      </fieldset>

      <fieldset className="editor-group">
        <legend className="g-label">Look</legend>
        <div className="field-row">
          <div className="g-field">
            <label htmlFor={id("accent")} className="field-label">
              Accent colour <ProTag on={plan.accent} />
            </label>
            <div className="colour-field">
              <input
                type="color"
                className="colour-field__swatch"
                aria-label="Pick the accent colour"
                value={card.accent ?? STANDARD_ACCENT}
                onChange={(e) =>
                  set({ accent: e.target.value === STANDARD_ACCENT ? null : e.target.value })
                }
              />
              <HexInput
                id={id("accent")}
                value={card.accent ?? STANDARD_ACCENT}
                onChange={(v) => set({ accent: v === STANDARD_ACCENT ? null : v })}
              />
              {card.accent ? (
                <button
                  type="button"
                  className="g-btn g-btn--ghost g-btn--sm"
                  onClick={() => set({ accent: null })}
                >
                  Use volt
                </button>
              ) : null}
            </div>
          </div>
          <label className="g-field" htmlFor={id("thumbnail")}>
            <span className="field-label">
              Thumbnail <ProTag on={plan.images} />
            </span>
            <input
              className="g-input"
              id={id("thumbnail")}
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={card.thumbnail ?? ""}
              maxLength={CARD_LIMITS.url}
              onChange={(e) => set({ thumbnail: e.target.value.trim() || null })}
            />
          </label>
        </div>
        <label className="g-field" htmlFor={id("image")}>
          <span className="field-label">
            Banner image <ProTag on={plan.images} />
          </span>
          <input
            className="g-input"
            id={id("image")}
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={card.image ?? ""}
            maxLength={CARD_LIMITS.url}
            onChange={(e) => set({ image: e.target.value.trim() || null })}
          />
          <span className="g-help">
            Any https image link. Discord shows it under the text; images uploaded to Discord also
            show in this preview.
          </span>
        </label>
        <fieldset className="g-field footer-field">
          <legend className="field-label">
            Footer <ProTag on={plan.footer} />
          </legend>
          <div className="segmented" role="radiogroup" aria-label="Footer">
            {(
              [
                ["standard", "Garrison"],
                ["custom", "Your own"],
                ["none", "None"],
              ] as const
            ).map(([value, label]) => (
              <label className="segmented__item" key={value}>
                <input
                  type="radio"
                  name={id("footer-mode")}
                  checked={mode === value}
                  onChange={() =>
                    set({
                      footer:
                        value === "standard"
                          ? null
                          : value === "none"
                            ? ""
                            : card.footer || "Your server's name",
                    })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {mode === "custom" ? (
            <input
              className="g-input"
              aria-label="Footer text"
              value={card.footer ?? ""}
              maxLength={CARD_LIMITS.footer}
              onChange={(e) => set({ footer: e.target.value || "" })}
            />
          ) : null}
        </fieldset>
      </fieldset>
    </>
  );
}

/**
 * Shown above the save button when a Free server tries a Pro option: the preview
 * keeps it, saving needs Pro. One click puts back what was saved.
 */
export function ProNotice({
  labels,
  onReset,
  planHref,
}: {
  labels: string[];
  onReset: () => void;
  planHref: string;
}) {
  if (!labels.length) return null;
  const list =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return (
    <div className="notice notice--pro" role="status">
      <span>
        {list} {labels.length === 1 ? "is" : "are"} part of Garrison Pro. The preview shows{" "}
        {labels.length === 1 ? "it" : "them"}; Free servers can't save{" "}
        {labels.length === 1 ? "it" : "them"}.
      </span>
      <span className="notice__actions">
        <button type="button" className="g-btn g-btn--secondary g-btn--sm" onClick={onReset}>
          Undo Pro changes
        </button>
        <a className="g-btn g-btn--ghost g-btn--sm" href={planHref}>
          See Pro
        </a>
      </span>
    </div>
  );
}
