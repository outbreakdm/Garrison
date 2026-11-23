import {
  emojiLabel,
  entitlements,
  getGuildPlan,
  getStarboard,
  listStarPosts,
  STANDARD_ACCENT,
  STARBOARD_LIMITS,
} from "@garrison/db";
import type { Metadata } from "next";
import { AutoSaveCard } from "@/components/AutoSave";
import { ProTag } from "@/components/cards/CardEditor";
import { HowItWorks } from "@/components/HowItWorks";
import { HeadNote, HeadSwitch } from "@/components/ModuleHead";
import { CompactLayout } from "@/components/PageLayouts";
import { RecValue } from "@/components/RecValue";
import { CheckList } from "@/components/settings";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { pageStatus } from "@/lib/module-states";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { undoChange } from "../settings/actions";
import { saveStarboard } from "./actions";

export const metadata: Metadata = { title: "Starboard" };

export default async function StarboardPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  // On but can't work (a missing channel, a missing permission): said in the head.
  const status = await pageStatus(guild.id, "/honors");
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
          <p>Messages that collect enough of one emoji are reposted to a channel of their own.</p>
          <HowItWorks>
            Each repost links back to the original. Only the message's IDs and its count are kept.
          </HowItWorks>
        </div>
        <HeadSwitch
          key={contentKey(config)}
          label="Starboard"
          name="enabled"
          form="settings-form"
          defaultChecked={config.enabled}
        />
        {status.state === "blocked" ? (
          <HeadNote
            reason={status.reason ?? "Something it needs is missing."}
            href={"#settings"}
            action={"Pick a channel"}
          />
        ) : null}
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

      <CompactLayout
        liveFirst={posts.length > 0}
        settings={
          <AutoSaveCard
            id="settings"
            title="Starboard"
            action={saveStarboard}
            undo={undoChange}
            guildId={guild.id}
            stamp={contentKey(config)}
            saveLabel="Save starboard"
          >
            <div className="card-col">
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
                    defaultValue={emojiLabel(config.emoji)}
                    maxLength={40}
                    required
                  />
                  <span className="g-help">
                    One emoji, or type one of this server's as :name:
                    {ent["emoji.custom"] ? "" : " (Pro)"}.
                  </span>
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
                  <RecValue field="threshold" value={3} initial={config.threshold} />
                </label>
              </div>
              <CheckList
                name="ignoredChannelIds"
                label="Never from these channels"
                value={config.ignoredChannelIds}
                options={channels.map((c) => ({ id: c.id, label: `#${c.name}` }))}
                help={<>The board itself is always skipped.</>}
              />
              <div className="g-field">
                <label htmlFor="accent" className="field-label">
                  Color <ProTag on={pro} />
                </label>
                <input
                  className="color-field__swatch"
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
          </AutoSaveCard>
        }
        live={
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
                        <span className="ticket-row__topic">
                          {names.get(p.authorId) ?? "A member"}
                        </span>
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
        }
      />
    </>
  );
}
