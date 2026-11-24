"use client";

import { isPresetBackground, RANK_BACKGROUNDS, WELCOME_IMAGE_LINE_MAX } from "@garrison/db/cards";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackgroundChip } from "@/components/cards/BackgroundChip";

/** The welcome image as it's set up right now on the page. */
export interface PickedImage {
  /** Null when it's off; a preset background's key, an image link, or "" while "Your image"
   * waits for its link. */
  image: string | null;
  /** Posted on its own, as the whole message, instead of in the welcome card. */
  alone: boolean;
  /** On its own: the new member is mentioned above it. */
  ping: boolean;
  /** The lines around their name, as typed (empty is the standard line). */
  top: string;
  bottom: string;
}

/**
 * The welcome image as it's picked, shared between its panel and the welcome card's preview
 * (two forms on the page), so the preview follows every change before it's saved.
 */
const Picked = createContext<{ value: PickedImage; set: (v: PickedImage) => void } | null>(null);

export function WelcomeImageProvider({
  saved,
  children,
}: {
  saved: PickedImage;
  children: ReactNode;
}) {
  const [value, set] = useState(saved);
  const shared = useMemo(() => ({ value, set }), [value]);
  return <Picked value={shared}>{children}</Picked>;
}

/** The welcome image set up on this page, or null outside the join card's tab. */
export const usePickedWelcomeImage = () => useContext(Picked)?.value ?? null;

const TOKENS = ["{name}", "{server}", "{count}"];

/**
 * The welcome image panel's fields: off, a preset background or the server's own image and
 * its link; then, once there's an image, how it's posted (in the welcome card or on its own,
 * with or without a mention) and its two lines. They stay uncontrolled for the panel's
 * autosave; each change also tells the welcome card's preview, which draws it as the bot will.
 * On Free the extra fields are disabled, so they aren't sent (the image is paused there).
 */
export function WelcomeImageFields({ saved, pro }: { saved: PickedImage; pro: boolean }) {
  const set = useContext(Picked)?.set;
  const box = useRef<HTMLDivElement>(null);
  const read = useCallback(() => {
    const el = box.current;
    if (!el || !set) return;
    const input = (selector: string) => el.querySelector<HTMLInputElement>(selector);
    const choice = input('input[name="background"]:checked')?.value ?? "";
    const link = input('input[name="imageUrl"]')?.value.trim() ?? "";
    set({
      image: choice === "image" ? link : choice || null,
      alone: input('input[name="layout"][value="alone"]')?.checked ?? false,
      ping: input('input[name="ping"]')?.checked ?? false,
      top: input('input[name="top"]')?.value ?? "",
      bottom: input('input[name="bottom"]')?.value ?? "",
    });
  }, [set]);
  // On first show, and again when an Undo remounts the fields with the restored image.
  useEffect(() => read(), [read]);

  const own = saved.image && !isPresetBackground(saved.image) ? saved.image : "";
  return (
    <div ref={box} className="welcome-image" onChange={read}>
      <div className="swatches" role="radiogroup" aria-label="Background">
        <label className="swatch">
          <input type="radio" name="background" value="" defaultChecked={!saved.image} />
          <span className="swatch__chip swatch__chip--off" aria-hidden="true" />
          <span className="swatch__name">Off</span>
        </label>
        {Object.entries(RANK_BACKGROUNDS).map(([key, bg]) => (
          <label className="swatch" key={key}>
            <input
              type="radio"
              name="background"
              value={key}
              defaultChecked={saved.image === key}
              disabled={!pro && saved.image !== key}
            />
            <BackgroundChip from={bg.from} to={bg.to} />
            <span className="swatch__name">{bg.label}</span>
          </label>
        ))}
        <label className="swatch swatch--image">
          <input
            type="radio"
            name="background"
            value="image"
            defaultChecked={Boolean(own)}
            disabled={!pro && !saved.image}
          />
          <span className="swatch__chip" aria-hidden="true" />
          <span className="swatch__name">Your image</span>
        </label>
      </div>
      <label className="g-field" htmlFor="imageUrl">
        <span>Image link</span>
        <input
          className="g-input"
          id="imageUrl"
          name="imageUrl"
          type="url"
          inputMode="url"
          placeholder="https://cdn.discordapp.com/attachments/…"
          defaultValue={own}
        />
        <span className="g-help">
          Upload it to any Discord channel and copy its link. 1000 × 360 fits best.
        </span>
      </label>

      <fieldset className="editor-group welcome-image__more" disabled={!pro}>
        <legend className="g-label">How it's posted</legend>
        <div className="segmented" role="radiogroup" aria-label="How it's posted">
          <label className="segmented__item">
            <input type="radio" name="layout" value="card" defaultChecked={!saved.alone} />
            <span>In the welcome card</span>
          </label>
          <label className="segmented__item">
            <input type="radio" name="layout" value="alone" defaultChecked={saved.alone} />
            <span>On its own</span>
          </label>
        </div>
        <label className="switch welcome-image__ping">
          <input type="checkbox" name="ping" defaultChecked={saved.ping} />
          <span className="switch__text">
            <span className="field-label">Mention them above it</span>
            <span className="g-help">
              On its own the image is the whole message. A mention pings the new member so they see
              it.
            </span>
          </span>
        </label>
        <div className="field-row">
          <label className="g-field" htmlFor="imageTop">
            <span>Line above their name</span>
            <input
              className="g-input"
              id="imageTop"
              name="top"
              maxLength={WELCOME_IMAGE_LINE_MAX}
              defaultValue={saved.top}
            />
          </label>
          <label className="g-field" htmlFor="imageBottom">
            <span>Line under their name</span>
            <input
              className="g-input"
              id="imageBottom"
              name="bottom"
              maxLength={WELCOME_IMAGE_LINE_MAX}
              defaultValue={saved.bottom}
            />
          </label>
        </div>
        <p className="g-help">
          Type{" "}
          {TOKENS.map((t, i) => (
            <span key={t}>
              {i ? (i === TOKENS.length - 1 ? " or " : ", ") : ""}
              <code className="placeholder">{t}</code>
            </span>
          ))}{" "}
          for their details. The top line shows in capitals; an empty line goes back to the standard
          one.
        </p>
      </fieldset>
    </div>
  );
}
