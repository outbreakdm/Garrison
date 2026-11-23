"use client";

import { isPresetBackground, RANK_BACKGROUNDS } from "@garrison/db/cards";
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

/**
 * The welcome image as it's picked right now, shared between its panel and the welcome
 * card's preview (two forms on the page): null when it's off, a preset background's key, an
 * image link, or "" while "Your image" waits for its link.
 */
const Picked = createContext<{ value: string | null; set: (v: string | null) => void } | null>(
  null,
);

export function WelcomeImageProvider({
  saved,
  children,
}: {
  saved: string | null;
  children: ReactNode;
}) {
  const [value, set] = useState(saved);
  const shared = useMemo(() => ({ value, set }), [value]);
  return <Picked value={shared}>{children}</Picked>;
}

/** The welcome image picked on this page, or null (it's off, or this isn't the join card). */
export const usePickedWelcomeImage = () => useContext(Picked)?.value ?? null;

/**
 * The welcome image panel's fields: off, a preset background or the server's own image, and
 * that image's link. They stay uncontrolled for the panel's autosave; each change also tells
 * the welcome card's preview, which draws the image as the bot will.
 */
export function WelcomeImageFields({ saved, pro }: { saved: string | null; pro: boolean }) {
  const set = useContext(Picked)?.set;
  const box = useRef<HTMLDivElement>(null);
  const read = useCallback(() => {
    const el = box.current;
    if (!el || !set) return;
    const choice =
      el.querySelector<HTMLInputElement>('input[name="background"]:checked')?.value ?? "";
    const link = el.querySelector<HTMLInputElement>('input[name="imageUrl"]')?.value.trim() ?? "";
    set(choice === "image" ? link : choice || null);
  }, [set]);
  // On first show, and again when an Undo remounts the fields with the restored image.
  useEffect(() => read(), [read]);

  const own = saved && !isPresetBackground(saved) ? saved : "";
  return (
    <div ref={box} className="welcome-image" onChange={read}>
      <div className="swatches" role="radiogroup" aria-label="Background">
        <label className="swatch">
          <input type="radio" name="background" value="" defaultChecked={!saved} />
          <span className="swatch__chip swatch__chip--off" aria-hidden="true" />
          <span className="swatch__name">Off</span>
        </label>
        {Object.entries(RANK_BACKGROUNDS).map(([key, bg]) => (
          <label className="swatch" key={key}>
            <input
              type="radio"
              name="background"
              value={key}
              defaultChecked={saved === key}
              disabled={!pro && saved !== key}
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
            disabled={!pro && !saved}
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
    </div>
  );
}
