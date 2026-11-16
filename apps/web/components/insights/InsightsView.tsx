import type { getInsights } from "@garrison/db";
import Link from "next/link";
import { ProTag } from "@/components/cards/CardEditor";
import { EmptyState } from "@/components/EmptyState";
import { Bars } from "@/components/insights/Bars";
import { HourBars } from "@/components/insights/HourBars";
import { halfDelta, Sparkline } from "@/components/insights/Sparkline";

export const INSIGHT_WINDOWS = [7, 30, 90, 365] as const;
export const INSIGHT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "members", label: "Members" },
] as const;
export type InsightTab = (typeof INSIGHT_TABS)[number]["key"];
const WINDOWS = INSIGHT_WINDOWS;
const TABS = INSIGHT_TABS;
const n = (v: number) => v.toLocaleString("en-US");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
/** "Nov 14" from "2026-11-14", in UTC like the counts. */
const short = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * The Insights tabs, range and charts, for the dashboard and for a shared link. Shared, it
 * shows counts and charts only: no inviter names, nothing that links back into the dashboard.
 */
export function InsightsView({
  data,
  names,
  days,
  maxDays,
  tab,
  base,
  guildId,
  shared = false,
}: {
  data: Awaited<ReturnType<typeof getInsights>>;
  names: Map<string, string>;
  days: number;
  maxDays: number;
  tab: InsightTab;
  /** Where the tabs and ranges link: the page itself. */
  base: string;
  guildId: string;
  shared?: boolean;
}) {
  const { totals, retention } = data;
  const first = data.daily[0]?.day ?? "";
  const mid = data.daily[Math.floor(data.daily.length / 2)]?.day ?? "";
  const last = data.daily.at(-1)?.day ?? "";
  const axis: [string, string, string] = [short(first), short(mid), `${short(last)} (UTC)`];
  const net = totals.joins - totals.leaves;
  const channelTotal = data.channels.reduce((s, c) => s + c.messages, 0);
  const empty = totals.messages === 0 && totals.joins === 0 && totals.leaves === 0;
  const series = {
    messages: data.daily.map((d) => d.messages),
    active: data.daily.map((d) => d.active),
    net: data.daily.map((d) => d.joins - d.leaves),
  };
  return (
    <>
      <div className="ins-bar">
        <nav className="ins-tabs" aria-label="Insights">
          {TABS.map((t) => (
            <Link
              key={t.key}
              className="ins-tab"
              href={`${base}?tab=${t.key}&days=${days}`}
              aria-current={t.key === tab ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <nav className="list-head__filters" aria-label="Time range">
          {WINDOWS.map((w) =>
            w <= maxDays ? (
              <Link
                className="list-pill"
                key={w}
                href={`${base}?tab=${tab}&days=${w}`}
                scroll={false}
                aria-current={w === days ? "true" : undefined}
              >
                {w === 365 ? "1 year" : `${w} days`}
              </Link>
            ) : shared ? null : (
              <Link
                className="list-pill list-pill--locked"
                key={w}
                href={`/servers/${guildId}/plan#plans`}
                data-pro="A year of insights instead of 30 days, and a spreadsheet of every day."
              >
                {w === 365 ? "1 year" : `${w} days`} <ProTag on={false} />
              </Link>
            ),
          )}
        </nav>
      </div>

      {tab === "overview" ? (
        <section className="stat-tiles" aria-label="Totals">
          <StatTile
            label="Messages"
            value={n(totals.messages)}
            sub={`${n(Math.round(totals.messages / days))} a day`}
            delta={halfDelta(series.messages)}
            trend={series.messages}
            days={days}
          />
          <StatTile
            label="Active members"
            value={totals.active === null ? n(totals.activePerDay) : n(totals.active)}
            unit={totals.active === null ? "a day" : undefined}
            sub={
              totals.active === null
                ? "Average posting each day"
                : `Posted at least once · ${n(totals.activePerDay)} a day`
            }
            delta={halfDelta(series.active)}
            trend={series.active}
            days={days}
          />
          <StatTile
            label="Joined, net"
            value={`${net > 0 ? "+" : ""}${n(net)}`}
            tone={net > 0 ? "go" : net < 0 ? "caution" : undefined}
            sub={`${n(totals.joins)} joined · ${n(totals.leaves)} left`}
            trend={series.net}
            days={days}
          />
          <StatTile
            label="Stayed a week"
            value={retention.joined ? `${pct(retention.stayed, retention.joined)}%` : "—"}
            sub={
              retention.joined
                ? `${n(retention.stayed)} of ${n(retention.joined)} who joined over a week ago`
                : "Shows once members who joined here are a week in"
            }
            days={days}
          />
        </section>
      ) : null}

      {empty ? (
        <section className="g-card">
          <EmptyState compact mark="log" title="Nothing counted yet">
            Garrison counts messages, joins and leaves from the moment it's in your server. Check
            back tomorrow for the first full day.
          </EmptyState>
        </section>
      ) : null}

      {tab === "overview" ? (
        <div className="insights-grid">
          <section className="g-card card-col" aria-labelledby="ins-messages">
            <h2 className="card-title" id="ins-messages">
              Messages per day
            </h2>
            <Bars
              label={`Messages per day, last ${days} days`}
              axis={axis}
              bars={data.daily.map((d) => ({
                value: d.messages,
                title: `${short(d.day)}: ${n(d.messages)} messages, ${n(d.active)} members posted`,
              }))}
            />
          </section>
          <section className="g-card card-col" aria-labelledby="ins-members">
            <div className="row-between">
              <h2 className="card-title" id="ins-members">
                Joins and leaves
              </h2>
              <span className="chart-legend">
                <span className="chart-legend__item">
                  <span className="chart-legend__key" aria-hidden="true" /> Joined
                </span>
                <span className="chart-legend__item">
                  <span className="chart-legend__key chart-legend__key--down" aria-hidden="true" />{" "}
                  Left
                </span>
              </span>
            </div>
            <Bars
              label={`Joins above the line and leaves below, per day, last ${days} days`}
              axis={axis}
              bars={data.daily.map((d) => ({
                value: d.joins,
                down: d.leaves,
                title: `${short(d.day)}: ${n(d.joins)} joined, ${n(d.leaves)} left`,
              }))}
            />
          </section>
        </div>
      ) : null}

      {tab === "activity" ? (
        <>
          <div className="insights-grid">
            <section className="g-card card-col" aria-labelledby="ins-messages">
              <h2 className="card-title" id="ins-messages">
                Messages per day
              </h2>
              <Bars
                label={`Messages per day, last ${days} days`}
                axis={axis}
                bars={data.daily.map((d) => ({
                  value: d.messages,
                  title: `${short(d.day)}: ${n(d.messages)} messages, ${n(d.active)} members posted`,
                }))}
              />
            </section>
            <section className="g-card card-col" aria-labelledby="ins-hours">
              <h2 className="card-title" id="ins-hours">
                Busiest hours
              </h2>
              <HourBars utc={data.hours} />
              <span className="g-help">When to post announcements and schedule events.</span>
            </section>
          </div>
          <section className="g-card table-card" aria-labelledby="ins-channels">
            <div className="table-card__head">
              <h2 className="card-title" id="ins-channels">
                Busiest channels
              </h2>
            </div>
            {data.channels.length ? (
              <ul className="meter-list">
                {data.channels.map((c) => (
                  <li key={c.channelId}>
                    <span className="meter-list__name">
                      #{names.get(c.channelId) ?? "deleted-channel"}
                    </span>
                    <span className="meter-list__value">
                      {n(c.messages)}{" "}
                      <span className="muted">· {pct(c.messages, channelTotal)}%</span>
                    </span>
                    <meter
                      className="meter-list__bar"
                      min={0}
                      max={data.channels[0]?.messages ?? 1}
                      value={c.messages}
                      aria-label={`#${names.get(c.channelId) ?? "deleted-channel"}`}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact mark="log" title="No messages yet">
                Channels show here once members post.
              </EmptyState>
            )}
          </section>
        </>
      ) : null}

      {tab === "members" ? (
        <>
          <div className="insights-grid">
            <section className="g-card card-col" aria-labelledby="ins-members">
              <div className="row-between">
                <h2 className="card-title" id="ins-members">
                  Joins and leaves
                </h2>
                <span className="chart-legend">
                  <span className="chart-legend__item">
                    <span className="chart-legend__key" aria-hidden="true" /> Joined
                  </span>
                  <span className="chart-legend__item">
                    <span
                      className="chart-legend__key chart-legend__key--down"
                      aria-hidden="true"
                    />{" "}
                    Left
                  </span>
                </span>
              </div>
              <Bars
                label={`Joins above the line and leaves below, per day, last ${days} days`}
                axis={axis}
                bars={data.daily.map((d) => ({
                  value: d.joins,
                  down: d.leaves,
                  title: `${short(d.day)}: ${n(d.joins)} joined, ${n(d.leaves)} left`,
                }))}
              />
            </section>
            <section className="g-card card-col" aria-labelledby="ins-stayed">
              <h2 className="card-title" id="ins-stayed">
                Stayed a week
              </h2>
              <span className="g-stat">
                {retention.joined ? `${pct(retention.stayed, retention.joined)}%` : "—"}
              </span>
              <span className="g-help">
                {retention.joined
                  ? `${n(retention.stayed)} of ${n(retention.joined)} members who joined over a week ago were still here 7 days later.`
                  : "Shows once members who joined here are a week in."}
              </span>
            </section>
          </div>
          {shared ? null : (
            <section className="g-card table-card" aria-labelledby="ins-invites">
              <div className="table-card__head">
                <h2 className="card-title" id="ins-invites">
                  Where members come from
                </h2>
              </div>
              {data.invites.length ? (
                <>
                  <div className="table-wrap">
                    <table className="g-table">
                      <thead>
                        <tr>
                          {["Invited by", "Joined", "Stayed a week"].map((h) => (
                            <th key={h} scope="col">
                              <span className="g-label">{h}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.invites.map((i) => (
                          <tr key={i.inviterId}>
                            <td>{i.inviterName ?? i.inviterId}</td>
                            <td className="mono">{n(i.joins)}</td>
                            <td className="mono">{n(i.stayed)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="g-help table-card__foot">
                    Stayed a week counts members who joined over a week ago and hadn't left 7 days
                    later.
                  </p>
                </>
              ) : (
                <EmptyState compact mark="accounts" title="No invites traced yet">
                  Garrison matches each join to the invite it used. That needs the Manage Server
                  permission to read invites.
                </EmptyState>
              )}
            </section>
          )}
        </>
      ) : null}
    </>
  );
}

/**
 * A headline number: its label, the value, a line under it, and, when the range has one,
 * the change against the range's first half and its trend as a sparkline.
 */
function StatTile({
  label,
  value,
  unit,
  sub,
  delta,
  tone,
  trend,
  days,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  delta?: number | null;
  tone?: "go" | "caution";
  trend?: number[];
  days: number;
}) {
  const half = Math.floor(days / 2);
  return (
    <div className="g-card stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className={`stat-tile__value${tone ? ` tone-${tone}` : ""}`}>
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </span>
      <span className="stat-tile__foot">
        {delta !== undefined && delta !== null ? (
          <span
            className={`stat-tile__delta ${delta > 0 ? "tone-go" : delta < 0 ? "tone-caution" : ""}`}
            title={`The last ${half} days against the ${half} before`}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}%
          </span>
        ) : null}
        <span className="g-help">{sub}</span>
      </span>
      {trend ? (
        <Sparkline
          values={trend}
          label={`${label}, last ${days} days: from ${trend[0] ?? 0} on the first day to ${trend.at(-1) ?? 0} on the last.`}
        />
      ) : null}
    </div>
  );
}
