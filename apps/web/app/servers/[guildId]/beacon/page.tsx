import {
  ALERT_PROVIDERS,
  entitlements,
  FEED_HARD_MAX,
  feedLimit,
  getAlertFeeds,
  getGuildPlan,
  isFeedPaused,
  listAlertState,
  readAlertFeeds,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PlansLink } from "@/components/ProUpsell";
import { RequestsPanel } from "@/components/RequestsPanel";
import { FormPanel } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { requestAction } from "../requests";
import { addFeed, removeFeed, saveFeed } from "./actions";
import { FeedEditor } from "./FeedEditor";

export const metadata: Metadata = { title: "Alerts" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function AlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const query = await searchParams;
  const db = await getDb();
  const [raw, plan, states, channels, roles, flash] = await Promise.all([
    getAlertFeeds(db, guild.id),
    getGuildPlan(db, guild.id),
    listAlertState(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listNotifiableRoles(guild.id).catch(() => []),
    readFlash(),
  ]);
  const ent = entitlements(plan);
  const feeds = readAlertFeeds(raw);
  const limit = feedLimit(ent);
  const full = feeds.length >= limit;
  const paused = Math.max(0, feeds.length - limit);
  const editing = typeof query.edit === "string" ? query.edit : null;
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const stateOf = new Map(states.map((s) => [s.feedId, s]));

  /** What a feed is doing, in a few words. */
  const status = (feedId: string) => {
    const s = stateOf.get(feedId);
    if (!s?.checkedAt) return { text: "Checks within a few minutes", tone: "" };
    if (s.problem === "not_configured")
      return { text: "Waiting for Garrison's Twitch keys", tone: "g-badge--caution" };
    if (s.problem === "not_found") return { text: "Channel not found", tone: "g-badge--alert" };
    if (s.liveSince) return { text: "Live now", tone: "g-badge--go" };
    if (s.postedAt) return { text: `Last alert ${ago(s.postedAt)}`, tone: "" };
    return { text: "Watching", tone: "" };
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stream alerts</h1>
          <p>
            Garrison posts when a Twitch channel goes live or a YouTube channel posts a video, and
            pings the role you pick. Each stream and video is announced once.
          </p>
        </div>
        <span className="mono">
          {plan === "pro" ? "Pro" : "Free"} · {feeds.length} of {limit} alerts
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
      {paused ? (
        <div className="notice notice--pro" role="status">
          <span>
            This server has {feeds.length} alerts and its plan runs {limit}, so the last{" "}
            {plural(paused, "alert is", "alerts are")} paused: still saved, not checked. A paid plan
            brings {paused === 1 ? "it" : "them"} back.{" "}
            <PlansLink guildId={guild.id} className="" />
          </span>
        </div>
      ) : null}

      <RequestsPanel guildId={guild.id} kinds={["test_alert"]} query={query} />

      <FormPanel
        id="new"
        title="New alert"
        hint={
          full
            ? `${limit} of ${limit} alerts used${plan === "pro" ? "" : `. Pro runs ${FEED_HARD_MAX}.`}`
            : "A Twitch or YouTube channel, and where to post"
        }
        open={feeds.length === 0 || editing === "new"}
      >
        <form action={addFeed} className="card-col">
          <input type="hidden" name="guildId" value={guild.id} />
          <div className="segmented" role="radiogroup" aria-label="Watch">
            {(["twitch", "youtube"] as const).map((p, i) => (
              <label className="segmented__item" key={p}>
                <input type="radio" name="provider" value={p} defaultChecked={i === 0} />
                <span>
                  {ALERT_PROVIDERS[p].label}: when it {ALERT_PROVIDERS[p].verb}
                </span>
              </label>
            ))}
          </div>
          <div className="field-row">
            <label className="g-field" htmlFor="new-handle">
              <span>Channel to watch</span>
              <input
                className="g-input"
                id="new-handle"
                name="handle"
                required
                maxLength={120}
                placeholder="shroud, @handle or a channel link"
              />
            </label>
            <label className="g-field" htmlFor="new-channel">
              <span>Post in</span>
              <select className="g-input" id="new-channel" name="channelId" required>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="g-field" htmlFor="new-role">
              <span>Ping</span>
              <select className="g-input" id="new-role" name="roleId" defaultValue="">
                <option value="">Nobody</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-foot">
            <button type="submit" className="g-btn g-btn--primary" disabled={full}>
              {full ? `${limit} of ${limit} alerts used` : "Add alert"}
            </button>
            {plan === "free" ? (
              <span className="g-help">
                Free servers run {limit} alerts with the standard look. Pro runs {FEED_HARD_MAX},
                with your own message and color.
              </span>
            ) : null}
          </div>
        </form>
      </FormPanel>

      {feeds.map((feed, index) => {
        const st = status(feed.id);
        const facts = [
          ALERT_PROVIDERS[feed.provider].label,
          `#${channelName.get(feed.channelId) ?? "deleted-channel"}`,
          feed.roleId ? `pings @${roleName.get(feed.roleId) ?? "deleted-role"}` : "no ping",
        ];
        return (
          <details
            className="g-card panel"
            id={feed.id}
            key={`${feed.id}-${contentKey(feed)}`}
            open={editing === feed.id}
          >
            <summary className="panel__summary">
              <span className="panel__title panel__title--lg">{feed.handle}</span>
              {isFeedPaused(index, ent) ? (
                <span className="g-badge g-badge--caution">Paused</span>
              ) : (
                <span className={`g-badge ${st.tone}`}>{st.text}</span>
              )}
              <span className="panel__facts">
                {facts.map((f) => (
                  <span className="fact" key={f}>
                    {f}
                  </span>
                ))}
              </span>
              <span className="panel__cue" aria-hidden="true" />
            </summary>
            <div className="panel__body">
              <FeedEditor
                guildId={guild.id}
                saved={feed}
                ent={ent}
                channels={channels}
                roles={roles}
                planHref={`/servers/${guild.id}/plan`}
                saveAction={saveFeed}
                removeAction={removeFeed}
                requestAction={requestAction}
              />
            </div>
          </details>
        );
      })}

      {feeds.length ? (
        <p className="g-help">
          Every change is in{" "}
          <Link href={`/servers/${guild.id}/settings#history`}>Settings history</Link> and can be
          undone. YouTube is checked every 5 minutes, Twitch every 2.
        </p>
      ) : null}
    </>
  );
}
