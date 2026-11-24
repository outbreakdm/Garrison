import {
  ALERT_PROVIDER_LIST,
  ALERT_PROVIDERS,
  type AlertProvider,
  entitlements,
  FEED_HARD_MAX,
  feedLimit,
  getAlertFeeds,
  getGuildPlan,
  getStreamRequests,
  getTwitchSubRole,
  isFeedPaused,
  listAlertState,
  listStreamRequests,
  readAlertFeeds,
  streamPanelWords,
  streamUrl,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ProTag } from "@/components/cards/CardEditor";
import { formatTime } from "@/components/format";
import { HowItWorks } from "@/components/HowItWorks";
import { LibraryItem } from "@/components/Library";
import { ListHead } from "@/components/ListHead";
import { HeadStatus } from "@/components/ModuleHead";
import { PlansLink } from "@/components/ProUpsell";
import { PanelPostCard } from "@/components/panels/PanelPostCard";
import { RequestsPanel } from "@/components/RequestsPanel";
import { FormPanel } from "@/components/settings";
import { getDb } from "@/lib/db";
import { listGuildRoles, listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { contentKey, readFlash } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { requireGuildAccess } from "@/lib/session";
import { ago } from "../parley/when";
import { requestAction } from "../requests";
import { undoChange } from "../settings/actions";
import { addFeed, removeFeed, saveFeed } from "./actions";
import { FeedEditor } from "./FeedEditor";
import { saveStreamRequests } from "./request-actions";
import { StreamRequestsEditor } from "./StreamRequestsEditor";
import { disconnectSubRole, saveSubRole } from "./sub-roles";

export const metadata: Metadata = { title: "Stream alerts" };

/** The list filters (?show=), in pill order. */
const SHOWS = ["all", ...ALERT_PROVIDER_LIST] as const;

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
  const [raw, plan, states, channels, roles, flash, requests, waitingRequests] = await Promise.all([
    getAlertFeeds(db, guild.id),
    getGuildPlan(db, guild.id),
    listAlertState(db, guild.id),
    listTextChannels(guild.id).catch(() => []),
    listNotifiableRoles(guild.id).catch(() => []),
    readFlash(),
    getStreamRequests(db, guild.id),
    listStreamRequests(db, guild.id),
  ]);
  const [subRole, allRoles] = await Promise.all([
    getTwitchSubRole(db, guild.id),
    listGuildRoles(guild.id).catch(() => []),
  ]);
  const givable = allRoles.filter((r) => !r.managed && !isDangerousRole(r.permissions));
  const twitchReady = Boolean(
    process.env.TWITCH_CLIENT_ID &&
      process.env.TWITCH_CLIENT_SECRET &&
      process.env.TWITCH_EVENTSUB_SECRET,
  );
  const twitchResult = typeof query.twitch === "string" ? query.twitch : null;
  const ent = entitlements(plan);
  const feeds = readAlertFeeds(raw);
  const limit = feedLimit(ent);
  const full = feeds.length >= limit;
  const paused = Math.max(0, feeds.length - limit);
  const editing = typeof query.edit === "string" ? query.edit : null;
  const current = feeds.some((x) => x.id === editing) ? editing : null;
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const stateOf = new Map(states.map((s) => [s.feedId, s]));
  const show = SHOWS.find((k) => k === query.show) ?? "all";
  const shown = feeds
    .map((feed, index) => ({ feed, index }))
    .filter(({ feed }) => show === "all" || feed.provider === show);
  const base = `/servers/${guild.id}/beacon`;

  /** What a feed is doing, in a few words. */
  const status = (feed: { id: string; provider: AlertProvider }) => {
    const s = stateOf.get(feed.id);
    if (!s?.checkedAt) return { text: "Checks within a few minutes", tone: "" };
    if (s.problem === "not_configured")
      return {
        text: `Waiting for Garrison's ${ALERT_PROVIDERS[feed.provider].label} keys`,
        tone: "g-badge--caution",
      };
    if (s.problem === "not_found")
      return {
        text: feed.provider === "rss" ? "Feed not found" : "Not found",
        tone: "g-badge--alert",
      };
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
            A post when a Twitch or Kick channel goes live, a YouTube channel posts a video, or a
            subreddit, Bluesky account or RSS feed has something new.
          </p>
          <HowItWorks>
            It pings the role you pick, and each stream and video is announced once.
          </HowItWorks>
        </div>
        <HeadStatus
          on={feeds.length > 0}
          text={feeds.length ? `Watching ${plural(feeds.length, "channel")}` : "No channels yet"}
          href={feeds.length ? undefined : "#new"}
          action="Add one"
        />
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

      <RequestsPanel
        guildId={guild.id}
        kinds={["test_alert", "post_stream_panel", "stream_request_decide"]}
        query={query}
      />

      {current ? null : (
        <ListHead
          filters={SHOWS.map((k) => ({
            key: k,
            label: k === "all" ? "All" : ALERT_PROVIDERS[k].label,
            n: k === "all" ? feeds.length : feeds.filter((x) => x.provider === k).length,
            href: k === "all" ? base : `${base}?show=${k}`,
          }))}
          current={show}
          count={`${feeds.length} of ${limit} alerts`}
          create={{
            label: "New alert",
            href: `${base}?edit=new#new`,
            disabled: full
              ? `${limit} of ${limit} alerts used${plan === "pro" ? "" : `. Pro runs ${FEED_HARD_MAX}`}.`
              : undefined,
          }}
        />
      )}

      <div className="item-grid">
        {shown.map(({ feed, index }) => {
          const st = status(feed);
          const facts = [
            ALERT_PROVIDERS[feed.provider].label,
            `#${channelName.get(feed.channelId) ?? "deleted-channel"}`,
            feed.roleId ? `pings @${roleName.get(feed.roleId) ?? "deleted-role"}` : "no ping",
          ];
          return (
            <LibraryItem
              id={feed.id}
              key={`${feed.id}-${contentKey(feed)}`}
              editing={current}
              href={`${base}?edit=${feed.id}`}
              back={`${base}#${feed.id}`}
              backLabel="All stream alerts"
              summary={
                <>
                  <span className="item-tile__mark" aria-hidden="true" />
                  <span className="panel__title panel__title--lg">{feed.handle}</span>
                  {isFeedPaused(index, ent) ? (
                    <span className="g-badge g-badge--caution">Paused</span>
                  ) : null}
                  <span className="panel__facts">
                    {facts.map((f) => (
                      <span className="fact" key={f}>
                        {f}
                      </span>
                    ))}
                  </span>
                  {isFeedPaused(index, ent) ? null : (
                    <span className={`item-tile__state g-badge ${st.tone}`}>{st.text}</span>
                  )}
                </>
              }
            >
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
            </LibraryItem>
          );
        })}
        {current ? null : (
          <FormPanel
            id="new"
            className="item-tile item-tile--new"
            title="New alert"
            hint={
              full
                ? `${limit} of ${limit} alerts used${plan === "pro" ? "" : `. Pro runs ${FEED_HARD_MAX}.`}`
                : "A channel, subreddit, account or feed to watch, and where to post"
            }
            open={feeds.length === 0 || editing === "new"}
          >
            <form action={addFeed} className="card-col">
              <input type="hidden" name="guildId" value={guild.id} />
              <div className="segmented" role="radiogroup" aria-label="Watch">
                {ALERT_PROVIDER_LIST.map((p, i) => (
                  <label
                    className="segmented__item"
                    key={p}
                    title={`When it ${ALERT_PROVIDERS[p].verb}`}
                  >
                    <input type="radio" name="provider" value={p} defaultChecked={i === 0} />
                    <span>{ALERT_PROVIDERS[p].label}</span>
                  </label>
                ))}
              </div>
              <div className="field-row">
                <label className="g-field" htmlFor="new-handle">
                  <span>What to watch</span>
                  <input
                    className="g-input"
                    id="new-handle"
                    name="handle"
                    required
                    maxLength={500}
                    placeholder="shroud, @handle, r/valorant, name.bsky.social or https://…"
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
                    Free servers run {limit} alerts with the standard look. Pro runs {FEED_HARD_MAX}
                    , with your own message and color.
                  </span>
                ) : null}
              </div>
            </form>
          </FormPanel>
        )}
      </div>

      {current ? null : (
        <>
          {waitingRequests.length ? (
            <section className="g-card card-col" id="stream-requests" aria-labelledby="sr-title">
              <h2 className="card-title" id="sr-title">
                Streams members asked for <span className="count">{waitingRequests.length}</span>
              </h2>
              <ul className="answers-list">
                {waitingRequests.map((r) => (
                  <li className="answers-list__item" data-status="waiting" key={r.id}>
                    <div className="answers-list__head">
                      <strong>
                        {ALERT_PROVIDERS[r.provider as AlertProvider]?.label ?? r.provider}:{" "}
                        {streamUrl(r.provider as AlertProvider, r.handle) ? (
                          <a href={streamUrl(r.provider as AlertProvider, r.handle) ?? undefined}>
                            {r.handle}
                          </a>
                        ) : (
                          r.handle
                        )}
                      </strong>
                      <span className="muted">
                        {r.username} · {formatTime(r.createdAt)}
                        {r.note ? ` · ${r.note}` : ""}
                      </span>
                    </div>
                    <div className="answers-list__actions">
                      {(["approve", "decline"] as const).map((op) => (
                        <form action={requestAction} key={op}>
                          <input type="hidden" name="guildId" value={guild.id} />
                          <input type="hidden" name="page" value="beacon" />
                          <input type="hidden" name="kind" value="stream_request_decide" />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="op" value={op} />
                          <button
                            type="submit"
                            className={
                              op === "approve"
                                ? "g-btn g-btn--secondary g-btn--sm"
                                : "g-btn g-btn--ghost g-btn--sm"
                            }
                          >
                            {op === "approve" ? "Add their alerts" : "Decline"}
                          </button>
                        </form>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <StreamRequestsEditor
            guildId={guild.id}
            saved={{
              enabled: requests.requestsEnabled,
              reviewChannelId: requests.requestReviewChannelId,
              alertChannelId: requests.requestAlertChannelId,
              roleId: requests.requestRoleId,
              ...streamPanelWords(requests),
            }}
            channels={channels}
            roles={roles.map((r) => ({ id: r.id, name: r.name }))}
            action={saveStreamRequests}
            undo={undoChange}
            stamp={contentKey({
              ...requests,
              requestPanelChannelId: null,
              requestPanelMessageId: null,
            })}
          />
          <PanelPostCard
            id="post-stream-panel"
            guildId={guild.id}
            page="beacon"
            kind="post_stream_panel"
            channels={channels}
            posted={
              requests.requestPanelChannelId && requests.requestPanelMessageId
                ? {
                    channelId: requests.requestPanelChannelId,
                    messageId: requests.requestPanelMessageId,
                  }
                : null
            }
            suggested={requests.requestAlertChannelId}
            blocked={requests.requestsEnabled ? null : "Turn member requests on first."}
          />
        </>
      )}

      <section className="g-card card-col" id="sub-roles" aria-labelledby="sub-roles-title">
        <div className="card-head">
          <h2 className="card-title" id="sub-roles-title">
            Twitch subscriber role
          </h2>
          <ProTag on={ent["alerts.subRoles"]} />
        </div>
        <p className="g-help">
          Members who subscribe to your Twitch channel get a role. They link Twitch to Garrison from
          Discord Connections on their Account page; Garrison never sees your Twitch password, and
          your sign-in is used once, to read who subscribes now, then dropped. Twitch tells Garrison
          when subscriptions start and end.
        </p>
        {twitchResult === "connected" ? (
          <p className="notice notice--ok" role="status">
            Connected. {typeof query.subs === "string" ? `${query.subs} subscribers found.` : ""}
          </p>
        ) : twitchResult === "denied" ? (
          <p className="notice" role="alert">
            Twitch didn't give Garrison permission to read subscribers. Try again and allow it.
          </p>
        ) : twitchResult === "pro" ? (
          <p className="notice" role="alert">
            Subscriber roles are part of Garrison Pro.
          </p>
        ) : twitchResult === "error" ? (
          <p className="notice" role="alert">
            Twitch didn't answer. Nothing changed; try again in a minute.
          </p>
        ) : null}
        {subRole ? (
          <>
            <p>
              Connected to <strong>{subRole.broadcasterLogin}</strong>
              {subRole.status === "revoked"
                ? ". Twitch says the access was taken away: connect again to keep the role working."
                : "."}
            </p>
            <form action={saveSubRole} className="field-row">
              <input type="hidden" name="guildId" value={guild.id} />
              <label className="g-field" htmlFor="sub-role">
                <span>Role for subscribers</span>
                <select
                  className="g-input"
                  id="sub-role"
                  name="roleId"
                  defaultValue={subRole.roleId ?? ""}
                  disabled={!ent["alerts.subRoles"]}
                >
                  <option value="">None</option>
                  {givable.map((r) => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="g-btn g-btn--primary"
                disabled={!ent["alerts.subRoles"]}
              >
                Save
              </button>
            </form>
            <form action={disconnectSubRole}>
              <input type="hidden" name="guildId" value={guild.id} />
              <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                Disconnect Twitch
              </button>
            </form>
          </>
        ) : !twitchReady ? (
          <p className="g-help">
            Waiting for Garrison's Twitch keys: the bot's owner sets them up.
          </p>
        ) : ent["alerts.subRoles"] ? (
          <a className="g-btn g-btn--secondary" href={`/auth/twitch/login?guild=${guild.id}`}>
            Connect your Twitch channel
          </a>
        ) : (
          <p className="g-help">
            Comes with Garrison Pro. <PlansLink guildId={guild.id} />
          </p>
        )}
      </section>

      {feeds.length ? (
        <p className="g-help">
          Every change is in{" "}
          <Link href={`/servers/${guild.id}/settings#history`}>Settings history</Link> and can be
          undone. Twitch and Kick are checked every 2 minutes, YouTube every 5, and Reddit, Bluesky
          and RSS every 10.
        </p>
      ) : null}
    </>
  );
}
