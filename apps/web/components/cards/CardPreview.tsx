"use client";

import {
  type CustomCard,
  customEmojiUrl,
  parseEmoji,
  previewableImage,
  STANDARD_ACCENT,
  STANDARD_FOOTER,
} from "@garrison/db/cards";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { DiscordMarkdown, type MentionNames } from "./markdown";

/**
 * A card drawn the way Discord draws Garrison's Components V2 messages: the
 * channel, Garrison's name with the App tag, then the container with its colour
 * bar, title, text, dividers, image, the module's own controls and the footer.
 * Always Discord's dark theme, whatever the dashboard's theme.
 *
 * The CSP blocks style attributes, so the accent colour is set through the
 * CSSOM after render (allowed) as a custom property the stylesheet reads.
 */
export function CardPreview({
  card,
  channel,
  names,
  controls,
}: {
  card: CustomCard;
  /** The channel it's posted in, if known. */
  channel?: string | null;
  names: MentionNames;
  /** What the module adds under the card: a role menu's buttons or dropdown. */
  controls?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const accent = card.accent ?? STANDARD_ACCENT;
  useLayoutEffect(() => {
    box.current?.style.setProperty("--dc-accent", accent);
  }, [accent]);

  const footer = card.footer ?? STANDARD_FOOTER;
  const thumb = card.thumbnail;
  return (
    <figure className="dc" aria-label="Preview of the message in Discord">
      <div className="dc__channel">
        <span className="dc__hash" aria-hidden="true">
          #
        </span>{" "}
        {channel ?? "your-channel"}
      </div>
      <div className="dc__msg">
        <div className="dc__avatar" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
            <path
              d="M58 20V12L52 6H12L6 12V38C6 50 18 56 32 61C46 56 58 50 58 38V34H33"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
            />
          </svg>
        </div>
        <div className="dc__body">
          <div className="dc__author">
            <span className="dc__name">Garrison</span>
            <span className="dc__app">App</span>
            <span className="dc__time">Today at 21:04</span>
          </div>
          <div className="dc-card" ref={box}>
            <div className={thumb ? "dc-card__head dc-card__head--thumb" : "dc-card__head"}>
              <div className="dc-card__titles">
                {card.author ? <div className="dc-sub dc-card__author">{card.author}</div> : null}
                <div className="dc-h dc-h3">
                  {card.url ? (
                    <span className="dc-card__link">{card.title || "Untitled card"}</span>
                  ) : (
                    card.title || "Untitled card"
                  )}
                </div>
              </div>
              {thumb ? (
                <PreviewImage url={thumb} className="dc-card__thumb" label="Thumbnail" />
              ) : null}
            </div>
            {card.blocks.length ? <hr className="dc-card__rule" /> : null}
            {card.blocks.map((b, i) =>
              b.kind === "divider" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no IDs; order is the identity
                <hr className="dc-card__rule" key={i} />
              ) : b.kind === "field" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                <div className="dc-card__text dc-card__field" key={i}>
                  <strong>{b.name || "Field name"}</strong>
                  <DiscordMarkdown text={b.value || "Value"} names={names} />
                </div>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: as above
                <div className="dc-card__text" key={i}>
                  <DiscordMarkdown text={b.text} names={names} />
                </div>
              ),
            )}
            {card.image ? (
              <PreviewImage url={card.image} className="dc-card__image" label="Banner image" />
            ) : null}
            {controls ? <div className="dc-card__controls">{controls}</div> : null}
            {footer ? <div className="dc-sub">{footer}</div> : null}
          </div>
        </div>
      </div>
    </figure>
  );
}

/**
 * The dashboard can only load images from Discord's CDN. Anything else shows a
 * marked stand-in with the host, since Discord itself will load it fine.
 */
function PreviewImage({
  url,
  className,
  label,
}: {
  url: string;
  className: string;
  label: string;
}) {
  if (previewableImage(url))
    // biome-ignore lint/performance/noImgElement: a remote, user-chosen image in a live preview
    return <img className={className} src={url} alt={label} loading="lazy" />;
  let host = "that site";
  try {
    host = new URL(url).hostname;
  } catch {}
  return (
    <div className={`${className} dc-standin`} role="img" aria-label={`${label} from ${host}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="dc-standin__host">{host}</span>
    </div>
  );
}

/** One emoji in a preview: a server emoji as its image from Discord's CDN. */
export function PreviewEmoji({ emoji }: { emoji: string }) {
  const e = parseEmoji(emoji);
  if (e?.kind === "custom")
    // biome-ignore lint/performance/noImgElement: a 20px emoji from Discord's CDN, not page art
    return <img className="dc-emoji" src={customEmojiUrl(e)} alt="" width={20} height={20} />;
  return <span aria-hidden="true">{emoji}</span>;
}

/** A role menu's buttons, drawn like Discord's grey buttons. */
export function PreviewButtons({ labels }: { labels: { label: string; emoji: string | null }[] }) {
  if (!labels.length) return <div className="dc-empty">Buttons appear here as you add roles.</div>;
  return (
    <div className="dc-buttons">
      {labels.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat while typing
        <span className="dc-btn" key={i}>
          {b.emoji ? <PreviewEmoji emoji={b.emoji} /> : null}
          {b.label || "Label"}
        </span>
      ))}
    </div>
  );
}

/** Link buttons, drawn like Discord's: grey, with the external-link mark. */
export function PreviewLinkButtons({ labels }: { labels: string[] }) {
  return (
    <div className="dc-buttons">
      {labels.map((label, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat while typing
        <span className="dc-btn" key={i}>
          {label || "Label"}
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </span>
      ))}
    </div>
  );
}

/** A role menu's dropdown, closed, as Discord draws it. */
export function PreviewDropdown({ placeholder }: { placeholder: string }) {
  return (
    <div className="dc-select">
      <span>{placeholder}</span>
      <span className="dc-select__cue" aria-hidden="true" />
    </div>
  );
}
