"use client";

import {
  type BotProfilePayload,
  isImageDataUri,
  PROFILE_IMAGE_SIZE,
  PROFILE_LIMITS,
} from "@garrison/db/cards";
import { useState } from "react";
import { ProNotice, ProTag } from "@/components/cards/CardEditor";

type Action = (form: FormData) => Promise<void>;
type Kind = keyof typeof PROFILE_IMAGE_SIZE;

/**
 * Resize a picked image in the browser to the size Discord shows, cropped to
 * fill, so what's sent is small and predictable. GIFs become still images.
 */
async function resize(file: File, kind: Kind): Promise<string> {
  const { width, height } = PROFILE_IMAGE_SIZE[kind];
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  bitmap.close();
  // PNG keeps an avatar's transparency; if it's too big, JPEG always fits.
  const png = kind === "avatar" ? canvas.toDataURL("image/png") : "";
  return png && isImageDataUri(png) ? png : canvas.toDataURL("image/jpeg", 0.86);
}

/** What happens to one image: left alone, replaced, or put back to Garrison's own. */
type ImageChange = { mode: "keep" } | { mode: "new"; data: string } | { mode: "reset" };

function ImageField({
  kind,
  label,
  help,
  current,
  change,
  onChange,
  pro,
}: {
  kind: Kind;
  label: string;
  help: string;
  current: string | null;
  change: ImageChange;
  onChange: (c: ImageChange) => void;
  pro: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const shown = change.mode === "new" ? change.data : change.mode === "reset" ? null : current;
  return (
    <div className="g-field">
      <span className="field-label">
        {label} <ProTag on={pro} />
      </span>
      <div className={`image-pick image-pick--${kind}`}>
        <span className="image-pick__frame">
          {shown ? (
            // biome-ignore lint/performance/noImgElement: a data URI or Discord CDN image, chosen live
            <img src={shown} alt={`${label} now`} />
          ) : (
            <span className="g-help">Garrison's own</span>
          )}
        </span>
        <span className="image-pick__actions">
          <label className="g-btn g-btn--secondary g-btn--sm file-btn">
            Choose image
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError(null);
                try {
                  const data = await resize(file, kind);
                  if (!isImageDataUri(data)) throw new Error("too big");
                  onChange({ mode: "new", data });
                } catch {
                  setError("That image couldn't be used. Try a PNG or JPEG.");
                }
              }}
            />
          </label>
          {current || change.mode === "new" ? (
            <button
              type="button"
              className="g-btn g-btn--ghost g-btn--sm"
              onClick={() => onChange(current ? { mode: "reset" } : { mode: "keep" })}
            >
              {current ? "Use Garrison's own" : "Clear"}
            </button>
          ) : null}
          {current && change.mode !== "keep" ? (
            <button
              type="button"
              className="g-btn g-btn--ghost g-btn--sm"
              onClick={() => onChange({ mode: "keep" })}
            >
              Keep current
            </button>
          ) : null}
        </span>
      </div>
      <span className={`g-help${error ? " g-help--error" : ""}`}>{error ?? help}</span>
    </div>
  );
}

/**
 * How Garrison looks in this server: nickname (Free), avatar, banner and bio
 * (Pro). Sent as one request the bot applies in Discord; only what changed is
 * sent, and "Garrison's own" puts each part back.
 */
export function BotProfileForm({
  guildId,
  current,
  pro,
  planHref,
  requestAction,
}: {
  guildId: string;
  current: { nick: string | null; avatarUrl: string | null; bannerUrl: string | null };
  pro: boolean;
  planHref: string;
  requestAction: Action;
}) {
  const [nick, setNick] = useState(current.nick ?? "");
  const [avatar, setAvatar] = useState<ImageChange>({ mode: "keep" });
  const [banner, setBanner] = useState<ImageChange>({ mode: "keep" });
  const [bio, setBio] = useState<string | undefined>(undefined);

  const payload: BotProfilePayload = {};
  if (nick.trim() !== (current.nick ?? "")) payload.nick = nick.trim() || null;
  if (avatar.mode !== "keep") payload.avatar = avatar.mode === "new" ? avatar.data : null;
  if (banner.mode !== "keep") payload.banner = banner.mode === "new" ? banner.data : null;
  if (bio !== undefined) payload.bio = bio.trim() || null;
  const changed = Object.keys(payload).length > 0;

  const locked = pro
    ? []
    : [
        ...(payload.avatar ? ["An avatar"] : []),
        ...(payload.banner ? ["A banner"] : []),
        ...(payload.bio ? ["A bio"] : []),
      ];
  const undoPro = () => {
    if (payload.avatar) setAvatar({ mode: "keep" });
    if (payload.banner) setBanner({ mode: "keep" });
    if (payload.bio) setBio(undefined);
  };

  const name = nick.trim() || "Garrison";
  const avatarShown =
    avatar.mode === "new" ? avatar.data : avatar.mode === "reset" ? null : current.avatarUrl;
  const bannerShown =
    banner.mode === "new" ? banner.data : banner.mode === "reset" ? null : current.bannerUrl;

  return (
    <form action={requestAction}>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="page" value="settings" />
      <input type="hidden" name="kind" value="bot_profile" />
      <input type="hidden" name="profile" value={JSON.stringify(payload)} />
      <div className="editor-layout">
        <div className="editor-fields">
          <label className="g-field" htmlFor="bot-nick">
            <span>Nickname</span>
            <input
              className="g-input"
              id="bot-nick"
              value={nick}
              maxLength={PROFILE_LIMITS.nick}
              placeholder="Garrison"
              onChange={(e) => setNick(e.target.value)}
            />
            <span className="g-help">What members see in this server. Empty uses Garrison.</span>
          </label>
          <ImageField
            kind="avatar"
            label="Avatar"
            help="Cropped to a square. Only this server sees it."
            current={current.avatarUrl}
            change={avatar}
            onChange={setAvatar}
            pro={pro}
          />
          <ImageField
            kind="banner"
            label="Banner"
            help="Cropped to 5 : 2, shown at the top of Garrison's profile."
            current={current.bannerUrl}
            change={banner}
            onChange={setBanner}
            pro={pro}
          />
          <div className="g-field">
            <label className="field-label" htmlFor="bot-bio">
              Bio <ProTag on={pro} />
            </label>
            <textarea
              className="g-input block__text"
              id="bot-bio"
              rows={3}
              maxLength={PROFILE_LIMITS.bio}
              placeholder="Left as it is"
              value={bio ?? ""}
              onChange={(e) => setBio(e.target.value)}
            />
            <span className="editor-row">
              <span className="g-help">
                Discord doesn't share the current bio, so what you write here replaces it.
              </span>
              {bio !== undefined ? (
                <button
                  type="button"
                  className="g-btn g-btn--ghost g-btn--sm"
                  onClick={() => setBio(undefined)}
                >
                  Leave as it is
                </button>
              ) : (
                <button
                  type="button"
                  className="g-btn g-btn--ghost g-btn--sm"
                  onClick={() => setBio("")}
                >
                  Clear the bio
                </button>
              )}
            </span>
          </div>
          <ProNotice labels={locked} onReset={undoPro} planHref={planHref} />
          <div className="form-foot">
            <button
              type="submit"
              className="g-btn g-btn--primary"
              disabled={!changed || locked.length > 0}
            >
              Update Garrison in Discord
            </button>
            <span className="g-help">
              {changed
                ? "Garrison changes itself in this server, usually within seconds."
                : "Change something to update it."}
            </span>
          </div>
        </div>

        <div className="preview-pane">
          <div className="preview-pane__head">
            <span className="g-label">Preview in Discord</span>
            <span className="g-help">Garrison's profile in this server</span>
          </div>
          <figure className="dc dc-profile" aria-label="Preview of Garrison's profile">
            <div className="dc-profile__banner">
              {bannerShown ? (
                // biome-ignore lint/performance/noImgElement: live preview of a chosen image
                <img src={bannerShown} alt="" />
              ) : null}
            </div>
            <div className="dc-profile__avatar">
              {avatarShown ? (
                // biome-ignore lint/performance/noImgElement: live preview of a chosen image
                <img src={avatarShown} alt="" />
              ) : (
                <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
                  <path
                    d="M58 20V12L52 6H12L6 12V38C6 50 18 56 32 61C46 56 58 50 58 38V34H33"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                  />
                </svg>
              )}
            </div>
            <div className="dc-profile__body">
              <div className="dc__author">
                <span className="dc-profile__name">{name}</span>
                <span className="dc__app">App</span>
              </div>
              <div className="dc-sub">garrison</div>
              {bio?.trim() ? <p className="dc-profile__bio">{bio.trim()}</p> : null}
            </div>
          </figure>
        </div>
      </div>
    </form>
  );
}
