"use client";

import {
  ALERT_LIMITS,
  ALERT_PROVIDERS,
  type AlertFeed,
  alertHeading,
  DEFAULT_ALERT_TEXT,
  type Entitlements,
  fillAlert,
  normalizeHandle,
  STANDARD_ACCENT,
} from "@garrison/db/cards";
import { useMemo, useState } from "react";
import { HexInput, ProNotice, ProTag } from "@/components/cards/CardEditor";
import { CardPreview, PreviewLinkButtons } from "@/components/cards/CardPreview";

type Action = (form: FormData) => Promise<void>;
type Choice = { id: string; name: string };

const SAMPLE = {
  twitch: { title: "Ranked grind to Diamond", game: "Valorant" },
  youtube: { title: "Raid night highlights", game: "" },
};

/** One alert: where it posts, who it pings and (Pro) its words and colour, beside a preview. */
export function FeedEditor({
  guildId,
  saved,
  ent,
  channels,
  roles,
  planHref,
  saveAction,
  removeAction,
  requestAction,
}: {
  guildId: string;
  saved: AlertFeed;
  ent: Entitlements;
  channels: Choice[];
  roles: (Choice & { mentionable: boolean })[];
  planHref: string;
  saveAction: Action;
  removeAction: Action;
  requestAction: Action;
}) {
  const [feed, setFeed] = useState<AlertFeed>(saved);
  const [handleText, setHandleText] = useState(saved.handle);
  const set = (patch: Partial<AlertFeed>) => setFeed((f) => ({ ...f, ...patch }));
  const id = (name: string) => `${saved.id}-${name}`;
  const dirty = JSON.stringify(feed) !== JSON.stringify(saved);
  const handleOk = normalizeHandle(feed.provider, handleText) !== null;

  const locked = ent["alerts.custom"]
    ? []
    : [
        ...(feed.message && feed.message !== saved.message ? ["Your own message"] : []),
        ...(feed.accent && feed.accent !== saved.accent ? ["Accent colour"] : []),
      ];
  const undoPro = () =>
    set({
      message: feed.message !== saved.message ? saved.message : feed.message,
      accent: feed.accent !== saved.accent ? saved.accent : feed.accent,
    });
  const blocked = locked.length
    ? "Undo the Pro changes to save, or upgrade."
    : !handleOk
      ? `Enter a ${ALERT_PROVIDERS[feed.provider].example}.`
      : null;

  // The preview shows the look being edited, as Pro would draw it.
  const preview = useMemo(() => {
    const look = {
      text: feed.message || DEFAULT_ALERT_TEXT[feed.provider],
      accent: feed.accent ?? STANDARD_ACCENT,
    };
    const name = feed.provider === "twitch" ? feed.handle : "Your channel";
    const sample = SAMPLE[feed.provider];
    const url =
      feed.provider === "twitch" ? `https://www.twitch.tv/${feed.handle}` : "https://youtu.be/…";
    return {
      card: {
        title: alertHeading(feed.provider, name),
        blocks: [
          {
            kind: "text" as const,
            text: fillAlert(look.text, { name, title: sample.title, game: sample.game, url }),
          },
        ],
        accent: look.accent === STANDARD_ACCENT ? null : look.accent,
        image: null,
        thumbnail: null,
        footer: "",
      },
      ping: feed.roleId ? (roles.find((r) => r.id === feed.roleId)?.name ?? "role") : null,
    };
  }, [feed, roles]);
  const names = useMemo(
    () => ({
      roles: new Map(roles.map((r) => [r.id, r.name])),
      channels: new Map(channels.map((c) => [c.id, c.name])),
    }),
    [roles, channels],
  );

  return (
    <div className="menu-editor">
      <form action={saveAction}>
        <input type="hidden" name="guildId" value={guildId} />
        <input
          type="hidden"
          name="feed"
          value={JSON.stringify({
            ...feed,
            handle: normalizeHandle(feed.provider, handleText) ?? handleText,
          })}
        />
        <div className="editor-layout">
          <div className="editor-fields">
            <div className="field-row">
              <label className="g-field" htmlFor={id("handle")}>
                <span>{ALERT_PROVIDERS[feed.provider].label} channel</span>
                <input
                  className={`g-input${handleOk ? "" : " g-input--invalid"}`}
                  id={id("handle")}
                  value={handleText}
                  aria-invalid={!handleOk}
                  placeholder={ALERT_PROVIDERS[feed.provider].example}
                  onChange={(e) => {
                    setHandleText(e.target.value);
                    const h = normalizeHandle(feed.provider, e.target.value);
                    if (h) set({ handle: h });
                  }}
                />
              </label>
              <label className="g-field" htmlFor={id("channel")}>
                <span>Post in</span>
                <select
                  className="g-input"
                  id={id("channel")}
                  value={feed.channelId}
                  onChange={(e) => set({ channelId: e.target.value })}
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="g-field" htmlFor={id("role")}>
              <span>Ping</span>
              <select
                className="g-input"
                id={id("role")}
                value={feed.roleId ?? ""}
                onChange={(e) => set({ roleId: e.target.value || null })}
              >
                <option value="">Nobody</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                    {r.mentionable ? "" : " (not mentionable)"}
                  </option>
                ))}
              </select>
              <span className="g-help">
                One role, never @everyone. The role must be mentionable, or Garrison needs Mention
                Everyone.
              </span>
            </label>

            <fieldset className="editor-group">
              <legend className="g-label">
                Message <ProTag on={ent["alerts.custom"]} />
              </legend>
              <label className="g-field" htmlFor={id("message")}>
                <span className="sr-only">Message</span>
                <textarea
                  className="g-input"
                  id={id("message")}
                  rows={3}
                  maxLength={ALERT_LIMITS.message}
                  placeholder="Leave empty for the standard words"
                  value={feed.message ?? ""}
                  onChange={(e) => set({ message: e.target.value || null })}
                />
                <span className="g-help">
                  Use <code>{"{name}"}</code>, <code>{"{title}"}</code>, <code>{"{game}"}</code> and{" "}
                  <code>{"{url}"}</code>. Discord formatting works.
                </span>
              </label>
              <div className="g-field">
                <label htmlFor={id("accent")} className="field-label">
                  Colour <ProTag on={ent["alerts.custom"]} />
                </label>
                <div className="colour-field">
                  <input
                    type="color"
                    className="colour-field__swatch"
                    aria-label="Pick the alert colour"
                    value={feed.accent ?? STANDARD_ACCENT}
                    onChange={(e) =>
                      set({ accent: e.target.value === STANDARD_ACCENT ? null : e.target.value })
                    }
                  />
                  <HexInput
                    id={id("accent")}
                    value={feed.accent ?? STANDARD_ACCENT}
                    onChange={(v) => set({ accent: v === STANDARD_ACCENT ? null : v })}
                  />
                </div>
              </div>
            </fieldset>

            <ProNotice labels={locked} onReset={undoPro} planHref={planHref} />
            <div className="form-foot">
              <button type="submit" className="g-btn g-btn--primary" disabled={Boolean(blocked)}>
                Save alert
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
              <span className="g-label">Preview in Discord</span>
              <span className="g-help">
                With a sample {feed.provider === "twitch" ? "stream" : "video"}
              </span>
            </div>
            {preview.ping ? <p className="preview-ping mono">@{preview.ping}</p> : null}
            <CardPreview
              card={preview.card}
              channel={names.channels.get(feed.channelId) ?? null}
              names={names}
              controls={
                <PreviewLinkButtons
                  labels={[feed.provider === "twitch" ? "Watch on Twitch" : "Watch on YouTube"]}
                />
              }
            />
            <p className="g-help">The stream's or video's thumbnail shows under the text.</p>
          </div>
        </div>
      </form>
      <div className="menu-editor__foot">
        <form action={requestAction} className="post-form">
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="page" value="beacon" />
          <input type="hidden" name="kind" value="test_alert" />
          <input type="hidden" name="feedId" value={saved.id} />
          <button type="submit" className="g-btn g-btn--secondary" disabled={dirty}>
            Send a test alert
          </button>
          <span className="g-help">
            {dirty
              ? "Save first: the test uses the saved alert."
              : "A sample in the alert's channel, without the ping."}
          </span>
        </form>
        <form action={removeAction}>
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="feedId" value={saved.id} />
          <button type="submit" className="g-btn g-btn--ghost">
            Remove this alert
          </button>
        </form>
      </div>
    </div>
  );
}
