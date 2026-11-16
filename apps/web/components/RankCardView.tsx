"use client";

import {
  isPresetBackground,
  previewableImage,
  progressShare,
  RANK_BACKGROUNDS,
  type RankCardStyle,
  rankAccent,
} from "@garrison/db/cards";
import { useLayoutEffect, useRef } from "react";

export interface RankCardNumbers {
  position: number | null;
  level: number;
  total: number;
  into: number;
  needed: number;
}

/**
 * A rank card as /rank draws it in Discord: the server's background and accent, the member's
 * name, rank, level and details, and the XP bar. Colors go in through the CSSOM (the CSP
 * allows that, not style attributes).
 */
export function RankCardView({
  style,
  name,
  numbers,
  details,
  linked = [],
}: {
  style: RankCardStyle;
  name: string;
  numbers: RankCardNumbers;
  details: { label: string; value: string }[];
  /** Accounts shown on the card's wide line when the server's card shows them. */
  linked?: string[];
}) {
  const card = useRef<HTMLDivElement>(null);
  const preset = isPresetBackground(style.background)
    ? RANK_BACKGROUNDS[style.background]
    : RANK_BACKGROUNDS.garrison;
  const image =
    !isPresetBackground(style.background) && previewableImage(style.background)
      ? style.background
      : null;
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--rc-from", preset?.from ?? "#0b0d10");
    el.style.setProperty("--rc-to", preset?.to ?? "#1a2028");
    el.style.setProperty("--rc-accent", rankAccent(style));
    el.style.setProperty("--rc-share", String(progressShare(numbers.into, numbers.needed)));
    el.style.setProperty("--rc-image", image ? `url("${encodeURI(image)}")` : "none");
  }, [preset, style, image, numbers.into, numbers.needed]);

  return (
    <div
      className={`rank-card${image ? " rank-card--image" : ""}`}
      ref={card}
      role="img"
      aria-label={`Rank card for ${name}: level ${numbers.level}${numbers.position ? `, rank ${numbers.position}` : ""}${details.length ? `. ${details.map((d) => `${d.label}: ${d.value}`).join(". ")}` : ""}`}
    >
      <span className="rank-card__avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="rank-card__name">{name}</span>
      <span className="rank-card__stats">
        <span className="rank-card__label">Rank</span>
        <span className="rank-card__rank">{numbers.position ? `#${numbers.position}` : "—"}</span>
        <span className="rank-card__label">Level</span>
        <span className="rank-card__level">{numbers.level}</span>
      </span>
      <span className="rank-card__details">
        {details.map((d) => (
          <span key={d.label}>
            <span className="rank-card__label">{d.label}</span> {d.value}
          </span>
        ))}
        {style.showLinked && linked.length && details.length < 3 ? (
          <span className="rank-card__wide">{linked.join(" · ")}</span>
        ) : null}
      </span>
      <span className="rank-card__xp">
        <span>{numbers.total.toLocaleString("en-US")} XP total</span>
        <span>
          {numbers.into.toLocaleString("en-US")} / {numbers.needed.toLocaleString("en-US")} XP
        </span>
      </span>
      <span className="rank-card__bar" aria-hidden="true">
        <span />
      </span>
    </div>
  );
}
