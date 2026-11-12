import {
  entitlements,
  getGuildPlan,
  getStarboard,
  listStarPosts,
  STANDARD_ACCENT,
  STARBOARD_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import { ProTag } from "@/components/cards/CardEditor";
import { FormFoot } from "@/components/settings";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { saveStarboard } from "./actions";

export const metadata: Metadata = { title: "Starboard" };

export default async function StarboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = await getDb();
  const [config, plan, posts, channels, flash] = await Promise.all([
    getStarboard(db, guild.id),
    getGuildPlan(db, guild.id),
    listStarPosts(db, guild.id, 25),
    listTextChannels(guild.id).catch(() => []),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const authors = [...new Set(posts.map((p) => p.authorId))].slice(0, 15);
  const names = new Map(
    (
      await Promise.all(authors.map((id) => fetchMemberCard(guild.id, id).catch(() => null)))
    ).flatMap((m) => (m ? [[m.id, m.name] as const] : [])),
  );
  const pro = ent["starboard.look"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Starboard</h1>
          <p>
            When a message collects enough of one emoji, Garrison reposts it to a channel of its
            own, with a link back. Only the message's IDs and its count are kept.
          </p>
        </div>
        <span className="mono">
          {config.enabled ? `On · ${config.threshold} ${config.emoji}` : "Off"}
        </span>
      </div>

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}

      <section className="g-card card-col" aria-labelledby="star-settings">
        <h2 className="card-title" id="star-settings">
          Settings
        </h2>
        <form action={saveStarboard} className="settings-form" key={contentKey(config)}>
          <input type="hidden" name="guildId" value={guild.id} />
          <label className="switch">
            <input type="checkbox" name="enabled" defaultChecked={config.enabled} />
            <span className="switch__text">
              <span>Starboard on</span>
            </span>
          </label>
          <div className="settings-grid">
            <label className="g-field" htmlFor="channelId">
              <span>Post starred messages in</span>
              <select
                className="g-input"
                id="channelId"
                name="channelId"
                defaultValue={config.channelId ?? ""}
              >
                <option value="">Pick a channel</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              <span className="g-help">
                Messages from age-restricted channels only go to an age-restricted board.
              </span>
            </label>
            <div className="field-row">
              <label className="g-field" htmlFor="emoji">
                <span>Emoji</span>
                <input
                  className="g-input option__emoji"
                  id="emoji"
                  name="emoji"
                  defaultValue={config.emoji}
                  maxLength={16}
                  required
                />
              </label>
              <label className="g-field" htmlFor="threshold">
                <span>Reactions needed</span>
                <input
                  className="g-input"
                  id="threshold"
                  name="threshold"
                  type="number"
                  min={1}
                  max={STARBOARD_LIMITS.threshold}
                  defaultValue={config.threshold}
                  required
                />
              </label>
            </div>
            <label className="g-field" htmlFor="ignoredChannelIds">
              <span>Never from these channels</span>
              <select
                className="g-input"
                id="ignoredChannelIds"
                name="ignoredChannelIds"
                multiple
                size={4}
                defaultValue={config.ignoredChannelIds}
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              <span className="g-help">
                Ctrl/⌘-click to pick several. The board itself is always skipped.
              </span>
            </label>
            <div className="g-field">
              <label htmlFor="accent" className="field-label">
                Colour <ProTag on={pro} />
              </label>
              <input
                className="colour-field__swatch"
                id="accent"
                name="accent"
                type="color"
                defaultValue={config.accent ?? STANDARD_ACCENT}
                disabled={!pro && !config.accent}
              />
              {!pro && config.accent ? (
                <span className="g-help">
                  Saved on Pro and paused on Free: the board uses volt.
                </span>
              ) : null}
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" name="selfStar" defaultChecked={config.selfStar} />
            <span className="switch__text">
              <span>Count the author's own reaction</span>
            </span>
          </label>
          <FormFoot label="Save starboard" guildId={guild.id} />
        </form>
      </section>

      <section className="g-card queue" aria-labelledby="star-recent">
        <h2 className="card-title" id="star-recent">
          On the board
        </h2>
        {posts.length ? (
          <ul className="queue__list">
            {posts.map((p) => (
              <li key={p.messageId}>
                <a
                  className="ticket-row"
                  href={`https://discord.com/channels/${guild.id}/${p.channelId}/${p.messageId}`}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <span className="ticket-row__num mono">
                    {config.emoji} {p.stars}
                  </span>
                  <span className="ticket-row__main">
                    <span className="ticket-row__topic">{names.get(p.authorId) ?? "A member"}</span>
                    <span className="ticket-row__who">
                      in #{channelName.get(p.channelId) ?? "deleted-channel"}
                    </span>
                  </span>
                  <span />
                  <span className="ticket-row__when mono">{ago(p.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="queue__empty muted">
            {config.enabled
              ? `Nothing yet. A message needs ${config.threshold} ${config.emoji} to get here.`
              : "Turn the starboard on, pick a channel, and starred messages show up here."}
          </p>
        )}
      </section>
    </>
  );
}
