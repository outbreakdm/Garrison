"use client";

import {
  isPresetBackground,
  isRankImage,
  previewableImage,
  RANK_BACKGROUNDS,
  STANDARD_ACCENT,
} from "@garrison/db/cards";
import { useLayoutEffect, useRef } from "react";

/**
 * The welcome image as the bot draws it (apps/bot/src/modules/welcome/banner.ts, 1000 × 360):
 * the member's avatar in an accent ring, "Welcome to <server>", their name and their member
 * number, on a preset background or the server's own image under a dark wash. Sizes are in
 * container units, so it scales with the preview like the attachment does in Discord. Colors
 * go in through the CSSOM (the CSP allows that, not style attributes).
 */
export function WelcomeBannerView({
  background,
  accent,
  name,
  server,
  count,
  avatar,
}: {
  /** A preset background's key, an image link, or "" while "Your image" waits for its link. */
  background: string;
  accent: string | null;
  name: string;
  server: string;
  count: number;
  avatar: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const preset = isPresetBackground(background)
    ? RANK_BACKGROUNDS[background]
    : RANK_BACKGROUNDS.garrison;
  const image = !isPresetBackground(background) && previewableImage(background) ? background : null;
  // What the preview can't show itself: a link still to paste, an image only Discord loads
  // (the dashboard may load cdn.discordapp.com alone), or a link the save will refuse.
  const note = isPresetBackground(background)
    ? null
    : !background
      ? "Paste your image's link"
      : image
        ? null
        : isRankImage(background)
          ? `Your image, from ${new URL(background).hostname}`
          : "Use a link from Discord";
  const ring = accent ?? STANDARD_ACCENT;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.setProperty("--wb-from", preset?.from ?? "#0b0d10");
    el.style.setProperty("--wb-to", preset?.to ?? "#1a2028");
    el.style.setProperty("--wb-accent", ring);
    el.style.setProperty("--wb-image", image ? `url("${encodeURI(image)}")` : "none");
  }, [preset, ring, image]);

  const number = `Member #${count.toLocaleString("en-US")}`;
  const welcome = `Welcome to ${server}`;
  return (
    <div
      className={`welcome-banner${image ? " welcome-banner--image" : ""}`}
      ref={box}
      role="img"
      aria-label={`Welcome image: ${name}'s avatar, ${welcome}, ${name}, ${number}`}
    >
      <span className="welcome-banner__avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
        {avatar ? (
          // biome-ignore lint/performance/noImgElement: a Discord avatar in a live preview
          <img src={avatar} alt="" loading="lazy" />
        ) : null}
      </span>
      <span className="welcome-banner__welcome" aria-hidden="true">
        {welcome.toUpperCase()}
      </span>
      <span className="welcome-banner__name" aria-hidden="true">
        {name}
      </span>
      <span className="welcome-banner__number" aria-hidden="true">
        {number}
      </span>
      {note ? (
        <span className="welcome-banner__note" aria-hidden="true">
          {note}
        </span>
      ) : null}
    </div>
  );
}
