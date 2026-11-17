import { inviteUrl } from "@garrison/brand";
import {
  capacity,
  getActivity,
  getBotStatus,
  getHealthSnapshot,
  getInsights,
  getOverview,
  listDashboardActions,
  listQmBuilds,
  listRecentCases,
  listSignups,
  QM_PLAN_TTL_MS,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { DurationBar, untilText } from "@/components/DurationBar";
import { ActionBadge, formatTime, plainMentions } from "@/components/format";
import { Bars } from "@/components/insights/Bars";
import { RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { channelNames, guildCounts } from "@/lib/discord";
import { moduleStates } from "@/lib/module-states";
import { ACTION_KIND } from "@/lib/rally-schema";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "./requests";

const WEEK_MS = 7 * 86_400_000;

export const metadata: Metadata = { title: "Overview" };

/** Off modules the Overview suggests, most protective first, each with why in a line. */
const WORTH: { name: string; href: string; why: string; tint: "cobalt" | "orchid" }[] = [
  {
    name: "Automod",
    href: "/watch",
    why: "Removes scam links, spam and mass mentions as they're posted.",
    tint: "cobalt",
  },
  {
    name: "Anti-raid",
    href: "/gatehouse",
    why: "Locks the server when too many people join too fast.",
    tint: "cobalt",
  },
  {
    name: "Moderation log",
    href: "/watch",
    why: "Posts every warning, timeout and ban to a staff channel.",
    tint: "cobalt",
  },
  {
    name: "Verification",
    href: "/gatehouse",
    why: "New members press a button before they can talk.",
    tint: "cobalt",
  },
  {
    name: "Welcome",
    href: "/herald",
    why: "Greets new members with a card in a channel you pick.",
    tint: "orchid",
  },
  {
    name: "Leveling",
    href: "/ranks",
    why: "XP for chatting, levels and role rewards.",
    tint: "orchid",
  },
];

/** A plan's status, in words. */
const BUILD_WORDS: Record<string, string> = {
  applied: "built",
  applying: "building",
  discarded: "discarded",
  failed: "didn't build",
  undone: "undone",
};

/** Which page shows a request's outcome, so a failure links to where it can be retried. */
const REQUEST_PAGE: Record<string, string> = {
  create_raid: "/rally",
  move_signup: "/rally",
  call_signups: "/rally",
  cancel_raid: "/rally",
  close_lfg: "/rally",
  create_lfg: "/rally",
  lfg_join: "/rally",
  lfg_leave: "/rally",
  raid_signup: "/rally",
  raid_withdraw: "/rally",
  lockdown_start: "/gatehouse",
  lockdown_end: "/gatehouse",
  release_quarantine: "/gatehouse",
  post_verify_panel: "/gatehouse",
  anti_nuke: "/gatehouse",
  undo_case: "/watch",
  mod_action: "/watch",
  purge: "/watch",
  qm_plan: "/quartermaster",
  qm_chat: "/quartermaster",
  qm_apply: "/quartermaster",
  qm_cancel: "/quartermaster",
  undo_build: "/quartermaster",
  post_role_menu: "/insignia",
  bot_profile: "/settings#profile",
  post_message: "/dispatch",
  post_ticket_panel: "/parley",
  ticket_action: "/parley",
  start_giveaway: "/spoils",
  giveaway_action: "/spoils",
  suggestion_status: "/suggestions",
  test_alert: "/beacon",
  backup_create: "/gatehouse#backups",
  backup_restore: "/gatehouse#backups",
  run_health: "#requests",
};

interface Attention {
  tone: "alert" | "caution";
  title: string;
  detail: string;
  href: string;
  go: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const num = (n: number) => n.toLocaleString("en-US");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** "Nov 14" from "2026-11-14", in UTC like the counts. */
const dayName = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** This week against the week before, as a signed whole percent; null with nothing to compare. */
function change(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/** A stat's change against last week: up green, down red, flat grey. */
function Delta({ value, suffix = "vs last week" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="ov-stat__note">{suffix}</span>;
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return (
    <span className="ov-stat__note">
      <span className={`ov-delta ov-delta--${tone}`}>
        {value > 0 ? "+" : ""}
        {value}%
      </span>{" "}
      {suffix}
    </span>
  );
}

/** Small line icons for the stat tiles, drawn in one stroke weight. */
const ICONS = {
  members:
    "M5.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-4 7c0-2.2 1.8-4 4-4s4 1.8 4 4M11 7.5a2 2 0 1 0 0-4m1.5 10.5c0-1.7-.9-3.1-2.2-3.7",
  messages: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z",
  active: "M1.5 8h3l2-4.5 3 9 2-4.5h3",
  cases: "M8 1.5 13.5 4v4c0 3-2.4 5.4-5.5 6.5C4.9 13.4 2.5 11 2.5 8V4z",
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const { guild } = await requireGuildAccess(guildId);
  const db = await getDb();
  const [o, cases, activity, health, [build], actions, ins, counts, mods, names, bot] =
    await Promise.all([
      getOverview(db, guild.id),
      listRecentCases(db, guild.id, 6),
      getActivity(db, guild.id),
      getHealthSnapshot(db, guild.id),
      listQmBuilds(db, guild.id, 1),
      listDashboardActions(db, guild.id, 30),
      getInsights(db, guild.id, 14),
      guildCounts(guild.id).catch(() => null),
      moduleStates(guild.id),
      channelNames(guild.id).catch(() => new Map<string, string>()),
      getBotStatus(db, 1)
        .then((b) => b.status)
        .catch(() => null),
    ]);
  // This week against last: messages, members posting each day, joins less leaves.
  const week = ins.daily.slice(-7);
  const before = ins.daily.slice(-14, -7);
  const messages7 = sum(week.map((d) => d.messages));
  const messagesChange = change(messages7, sum(before.map((d) => d.messages)));
  const activeChange = change(sum(week.map((d) => d.active)), sum(before.map((d) => d.active)));
  const net7 = sum(week.map((d) => d.joins - d.leaves));
  const topChannels = ins.channels.slice(0, 5);
  const topMax = Math.max(1, ...topChannels.map((c) => c.messages));
  // Garrison is live when it checked in within the last 3 minutes.
  const lastBeat = bot?.lastBeatAt.getTime() ?? null;
  const live = lastBeat !== null && Date.now() - lastBeat < 3 * 60_000;
  // Off modules worth turning on, safety first; at most four, each with why.
  const offByName = new Map(mods.filter((m) => m.state === "off").map((m) => [m.name, m]));
  const worth = WORTH.filter((w) => offByName.has(w.name)).slice(0, 4);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const fixUrl = clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId, guild.id) : null;
  const now = Date.now();
  const ago = (d: Date) => {
    const m = Math.round((now - d.getTime()) / 60_000);
    return m < 60
      ? `${m} min ago`
      : m < 2880
        ? `${Math.round(m / 60)} h ago`
        : `${Math.round(m / 1440)} d ago`;
  };
  const nextSignups = o.nextOp ? await listSignups(db, o.nextOp.id) : [];
  const seated = nextSignups.filter((x) => !x.bench);
  const g = o.gatehouse;
  const base = `/servers/${guild.id}`;

  // What needs someone, most urgent first. Nothing shows when nothing does.
  const attention: Attention[] = [];
  if (o.activeLockdown)
    attention.push({
      tone: "alert",
      title: "The server is locked down",
      detail: "@everyone can't post until the lockdown is lifted. Staff roles still can.",
      href: `${base}/gatehouse`,
      go: "Security",
    });
  if (o.quarantines24h > 0)
    attention.push({
      tone: "alert",
      title: `${plural(o.quarantines24h, "member", "members")} quarantined by anti-nuke`,
      detail: "Their roles were removed and saved. Restore them if it was a mistake.",
      href: `${base}/gatehouse`,
      go: "Security",
    });
  const failing = health?.checks.filter((c) => c.status !== "ok") ?? [];
  if (failing.length)
    attention.push({
      tone: failing.some((c) => c.status === "fix") ? "alert" : "caution",
      title: `${plural(failing.length, "health check needs", "health checks need")} a look`,
      detail: plainMentions(failing[0]?.text ?? ""),
      href: "#health",
      go: "See checks",
    });
  const planWaiting =
    build?.status === "pending" && now - build.createdAt.getTime() < QM_PLAN_TTL_MS;
  if (planWaiting && build)
    attention.push({
      tone: "caution",
      title: `AI assistant plan v${build.version} is waiting`,
      detail: "Nothing changes in Discord until someone builds it. Plans expire after 15 minutes.",
      href: `${base}/quartermaster`,
      go: "Review plan",
    });
  const untilRaid = o.nextOp ? o.nextOp.startsAt.getTime() - now : null;
  if (o.nextOp && untilRaid !== null && untilRaid > 0 && untilRaid < 3 * 86_400_000) {
    const short = o.nextOp.slots
      .map((s) => ({ name: s.name, n: s.count - seated.filter((x) => x.role === s.name).length }))
      .filter((s) => s.n > 0);
    if (short.length)
      attention.push({
        tone: "caution",
        title: `${o.nextOp.title} is ${short.reduce((t, s) => t + s.n, 0)} short`,
        detail: `${formatTime(o.nextOp.startsAt, o.nextOp.timezone)} · ${short
          .map((s) => `${s.n} ${s.name}`)
          .join(", ")}`,
        href: `${base}/rally`,
        go: "Groups and raids",
      });
  }
  for (const m of mods.filter((x) => x.state === "blocked"))
    attention.push({
      tone: "caution",
      title: `${m.name} is on but can't work`,
      detail: m.reason ?? "Something it needs is missing.",
      href: `${base}${m.href}`,
      go: "Fix it",
    });
  const stuck = actions.filter(
    (a) =>
      (a.status === "pending" || a.status === "running") &&
      now - a.createdAt.getTime() > 10 * 60_000,
  );
  if (stuck[0])
    attention.push({
      tone: "caution",
      title: `${plural(stuck.length, "request has", "requests have")} waited over 10 minutes`,
      detail: live
        ? `${ACTION_KIND[stuck[0].kind] ?? "A request"}, asked ${ago(stuck[0].createdAt)}. Garrison may be busy; it runs them in order.`
        : "Garrison hasn't checked in lately, so requests wait until it's back. See the status page.",
      href: live ? `${base}${(REQUEST_PAGE[stuck[0].kind] ?? "").replace(/^#.*/, "")}` : "/status",
      go: live ? "Open" : "Status",
    });
  const failed = actions.filter(
    (a) => a.status === "failed" && now - a.createdAt.getTime() < 86_400_000,
  );
  if (failed[0])
    attention.push({
      tone: "caution",
      title: `${plural(failed.length, "request", "requests")} failed in the last day`,
      detail: `${ACTION_KIND[failed[0].kind] ?? failed[0].kind}: ${failed[0].message ?? "no reason given"}`,
      href: (REQUEST_PAGE[failed[0].kind] ?? "").startsWith("#")
        ? (REQUEST_PAGE[failed[0].kind] as string)
        : `${base}${REQUEST_PAGE[failed[0].kind] ?? ""}`,
      go: "Open",
    });

  return (
    <>
      <section className="g-card ov-hero" aria-label="Server">
        <span className="ov-hero__mark" aria-hidden="true">
          {(guild.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "G").toUpperCase()}
        </span>
        <div className="ov-hero__text">
          <ViewTransition
            name={`guild-${guild.id}`}
            share={{ nav: "morph", default: "none" }}
            default="none"
          >
            <h1 className="page-title ov-hero__name">{guild.name}</h1>
          </ViewTransition>
          <p className="ov-hero__meta">
            {counts?.members != null ? `${num(counts.members)} members` : "Members unknown"}
            {counts?.online != null ? ` · ${num(counts.online)} online` : ""}
          </p>
        </div>
        <div className="ov-hero__side">
          {lastBeat === null ? null : live ? (
            <span className="ov-live">
              <span className="ov-live__dot" aria-hidden="true" />
              Live
            </span>
          ) : (
            <a className="ov-live ov-live--late" href="/status">
              <span className="ov-live__dot" aria-hidden="true" />
              Last seen {ago(new Date(lastBeat))}
            </a>
          )}
          {build ? (
            <span className="ov-hero__build">
              AI assistant v{build.version} · {ago(build.createdAt)} ·{" "}
              {build.status === "pending"
                ? planWaiting
                  ? "waiting for review"
                  : "expired"
                : (BUILD_WORDS[build.status] ?? build.status.replace("_", " "))}
              {build.status === "applied" ? (
                <>
                  {" "}
                  · <a href={`${base}/quartermaster`}>Undo</a>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      </section>

      {build ? null : (
        <section className="g-card ov-ai" aria-labelledby="ov-ai-title">
          <div className="ov-ai__text">
            <h2 className="ov-ai__title" id="ov-ai-title">
              Set up this server by describing it
            </h2>
            <ul className="ov-ai__chips" aria-label="What the AI assistant can set up">
              <li>Channels</li>
              <li>Roles</li>
              <li>Module settings</li>
              <li>Role menus and panels</li>
            </ul>
          </div>
          <Link
            className="g-btn g-btn--primary"
            href={`${base}/quartermaster`}
            transitionTypes={["nav"]}
          >
            Open the AI assistant
          </Link>
        </section>
      )}

      {/* Band 1: what needs you, or one line saying nothing does, and the health check. */}
      <section
        className={attention.length ? "g-card attention" : "g-card attention attention--clear"}
        aria-labelledby="attention-title"
      >
        <div className="attention__head">
          <h2 className="card-title" id="attention-title">
            {attention.length ? (
              <>
                Needs attention <span className="count">{attention.length}</span>
              </>
            ) : (
              "All clear"
            )}
          </h2>
          <div className="attention__check">
            <span>{health ? `Health check ${ago(health.computedAt)}` : "No health check yet"}</span>
            <form action={requestAction}>
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="page" value="" />
              <input type="hidden" name="kind" value="run_health" />
              <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                Run a check
              </button>
            </form>
          </div>
        </div>
        {attention.length ? (
          <ul className="attention__list">
            {attention.map((a, i) => (
              <li key={a.title}>
                <a
                  className={`attention__item ${a.tone === "alert" ? "attention__item--alert" : ""}`}
                  href={a.href}
                  aria-label={`${a.title}. ${a.go}`}
                  aria-describedby={`attn-${i}`}
                >
                  <span className="attention__text">
                    <strong>{a.title}</strong>
                    <span id={`attn-${i}`}>{a.detail}</span>
                  </span>
                  <span className="attention__go">
                    {a.go}
                    <span className="cue" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="attention__clear">Every module that's on works.</p>
        )}
        {health ? (
          <details className="attention__checks" id="health" open={failing.length > 0}>
            <summary>
              Health checks <span className="count">{health.checks.length}</span>
            </summary>
            {health.checks.slice(0, 6).map((c) => (
              <div className="health-row" key={c.text}>
                <span
                  className={`g-badge ${c.status === "ok" ? "g-badge--go" : c.status === "fix" ? "g-badge--alert" : "g-badge--caution"}`}
                >
                  {c.status === "ok" ? "OK" : c.status === "fix" ? "Fix" : "Check"}
                </span>
                <span>{plainMentions(c.text)}</span>
              </div>
            ))}
            {health && health.problems > 0 && fixUrl ? (
              <a className="g-btn g-btn--primary" href={fixUrl}>
                Fix permissions
              </a>
            ) : null}
          </details>
        ) : null}
      </section>

      <RequestsPanel guildId={guild.id} kinds={["run_health"]} query={query} />

      {/* Band 2: the pulse. */}
      <section className="g-card ov-stats" aria-label="This week">
        <div className="ov-stat" data-tint="orchid">
          <span className="ov-stat__label">
            <span className="ov-stat__icon">
              <Icon d={ICONS.members} />
            </span>
            Members
          </span>
          <span className="ov-stat__value">
            {counts?.members != null ? num(counts.members) : "—"}
          </span>
          <span className="ov-stat__note">
            <span className={`ov-delta ov-delta--${net7 > 0 ? "up" : net7 < 0 ? "down" : "flat"}`}>
              {net7 > 0 ? "+" : ""}
              {num(net7)}
            </span>{" "}
            net, joins minus leaves · 7 d
          </span>
        </div>
        <div className="ov-stat" data-tint="steel">
          <span className="ov-stat__label">
            <span className="ov-stat__icon">
              <Icon d={ICONS.messages} />
            </span>
            Messages · 7 d
          </span>
          <span className="ov-stat__value">{num(messages7)}</span>
          <Delta value={messagesChange} />
        </div>
        <div className="ov-stat" data-tint="steel">
          <span className="ov-stat__label">
            <span className="ov-stat__icon">
              <Icon d={ICONS.active} />
            </span>
            Active members · 7 d
          </span>
          <span className="ov-stat__value">{num(activity.activeMembers7d)}</span>
          <Delta value={activeChange} />
        </div>
        <div className="ov-stat" data-tint="cobalt">
          <span className="ov-stat__label">
            <span className="ov-stat__icon">
              <Icon d={ICONS.cases} />
            </span>
            Mod actions · 24 h
          </span>
          <span className="ov-stat__value">{num(o.modActions24h)}</span>
          <span className="ov-stat__note">
            {o.automatic24h} automatic · {o.modActions24h - o.automatic24h} by staff
          </span>
        </div>
      </section>

      {/* Band 3: activity. */}
      <div className="ov-band">
        <section className="g-card card-col ov-w8" aria-labelledby="ov-messages" data-tint="steel">
          <div className="card-head">
            <h2 className="card-title" id="ov-messages">
              Messages <span className="count">14 days</span>
            </h2>
            <Link href={`${base}/insights`} transitionTypes={["nav"]}>
              Insights
            </Link>
          </div>
          <p className="ov-chart__total">
            <strong>{num(ins.totals.messages)}</strong> messages ·{" "}
            {ins.totals.activePerDay.toLocaleString("en-US", { maximumFractionDigits: 1 })} members
            posting a day
          </p>
          <Bars
            bars={ins.daily.map((d) => ({
              title: `${dayName(d.day)}: ${num(d.messages)} messages`,
              value: d.messages,
            }))}
            height={150}
            label="Messages each day, last 14 days"
            axis={[
              dayName(ins.daily[0]?.day ?? ""),
              dayName(ins.daily[7]?.day ?? ""),
              dayName(ins.daily.at(-1)?.day ?? ""),
            ]}
          />
          <h3 className="ov-sub" id="ov-channels">
            Top channels
          </h3>
          {topChannels.length ? (
            <ol className="ov-top">
              {topChannels.map((c) => (
                <li key={c.channelId}>
                  <span className="ov-top__name">
                    {names.has(c.channelId) ? (
                      `#${names.get(c.channelId)}`
                    ) : (
                      <span className="muted">A deleted channel</span>
                    )}
                  </span>
                  <span className="ov-top__n">{num(c.messages)}</span>
                  <meter
                    className="ov-top__bar"
                    min={0}
                    max={topMax}
                    value={c.messages}
                    aria-label={`${c.messages} messages`}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="ov-empty">
              No channel activity yet. Counts build up as members post; Garrison counts, never
              reads.
            </p>
          )}
        </section>

        <section className="g-card card-col ov-w4" aria-labelledby="cases-title" data-tint="cobalt">
          <div className="card-head">
            <h2 className="card-title" id="cases-title">
              Recent cases <span className="count">{cases.length}</span>
            </h2>
            <Link href={`${base}/watch`} transitionTypes={["nav"]}>
              All cases
            </Link>
          </div>
          {cases.length ? (
            <ul className="ov-cases">
              {cases.map((c) => (
                <li key={c.id}>
                  <ActionBadge action={c.action} />
                  <span className="ov-cases__who">{c.targetTag ?? "channel"}</span>
                  <span className="ov-cases__why">{c.reason ?? "No reason given"}</span>
                  <span className="ov-cases__when">{ago(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ov-empty">No cases yet. Warnings, timeouts and bans show up here.</p>
          )}
        </section>
      </div>

      {/* Band 4: modules, safety first. */}
      <div className="ov-band ov-band--tiles">
        {worth.length ? (
          <section className="g-card card-col ov-w3" aria-labelledby="ov-worth">
            <div className="card-head">
              <h2 className="card-title" id="ov-worth">
                Worth turning on <span className="count">{worth.length}</span>
              </h2>
            </div>
            <ul className="ov-worth">
              {worth.map((w) => (
                <li key={w.name} data-tint={w.tint}>
                  <Link
                    className="ov-worth__link"
                    href={`${base}${w.href}`}
                    transitionTypes={["nav"]}
                  >
                    <span className="ov-worth__name">
                      <span className="ov-worth__gem" aria-hidden="true" />
                      {w.name}
                    </span>
                    <span className="ov-worth__why">{w.why}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          className={`g-card card-col ${worth.length ? "ov-w3" : "ov-w4"}`}
          aria-labelledby="gatehouse-title"
          data-tint="cobalt"
        >
          <div className="card-head">
            <h2 className="card-title" id="gatehouse-title">
              Security
            </h2>
            <Link href={`${base}/gatehouse`} transitionTypes={["nav"]}>
              Manage
            </Link>
          </div>
          <div>
            <div className="status-line">
              <span>Lockdown</span>
              {o.activeLockdown ? (
                <span className="g-badge g-badge--alert">Active</span>
              ) : (
                <span className="g-badge g-badge--off">Off</span>
              )}
            </div>
            <div className="status-line">
              <span>Anti-raid</span>
              <span
                className={`g-badge ${g?.antiRaidEnabled ? "g-badge--go" : "g-badge--caution"}`}
              >
                {g?.antiRaidEnabled ? "Armed" : "Off"}
              </span>
            </div>
            <div className="status-line">
              <span>Anti-nuke</span>
              <span
                className={`g-badge ${g?.antiNukeEnabled ? "g-badge--go" : "g-badge--caution"}`}
              >
                {g?.antiNukeEnabled ? "Armed" : "Off"}
              </span>
            </div>
            <div className="status-line">
              <span>Verification</span>
              <span className={`g-badge ${g?.verifyRoleId ? "g-badge--go" : "g-badge--off"}`}>
                {g?.verifyRoleId ? "On" : "Off"}
              </span>
            </div>
          </div>
          <Link
            className={`g-btn g-btn--sm ${o.activeLockdown ? "g-btn--secondary" : "g-btn--danger"} ov-lock`}
            href={`${base}/gatehouse#lockdown`}
            transitionTypes={["nav"]}
          >
            {o.activeLockdown ? "Lift the lockdown…" : "Lock the server…"}
          </Link>
        </section>

        <section
          className={`g-card card-col ${worth.length ? "ov-w3" : "ov-w4"}`}
          aria-labelledby="next-op"
          data-tint="volt"
        >
          <div className="card-head">
            <h2 className="card-title" id="next-op">
              Next raid
            </h2>
            <Link href={`${base}/rally`} transitionTypes={["nav"]}>
              All raids
            </Link>
          </div>
          {o.nextOp ? (
            <>
              <div>
                <div className="big">{o.nextOp.title}</div>
                <div className="mono">{formatTime(o.nextOp.startsAt, o.nextOp.timezone)}</div>
              </div>
              {o.nextOp.startsAt.getTime() > Date.now() ? (
                <DurationBar
                  value={WEEK_MS - (o.nextOp.startsAt.getTime() - Date.now())}
                  max={WEEK_MS}
                  label="Time until the raid starts, out of a week"
                  text={`Starts ${untilText(o.nextOp.startsAt.getTime() - Date.now())}`}
                />
              ) : null}
              {o.nextOp.slots.map((s) => {
                const n = seated.filter((x) => x.role === s.name).length;
                return (
                  <div className="op-bar" key={s.name}>
                    <span>{s.name}</span>
                    <progress
                      className={`xpbar ${n >= s.count ? "xpbar--go" : ""}`}
                      value={Math.min(n, s.count)}
                      max={s.count}
                      aria-label={`${s.name}: ${n} of ${s.count}`}
                    />
                    <span className="mono">
                      {n}/{s.count}
                    </span>
                  </div>
                );
              })}
              <div className="mono">
                {seated.length} / {capacity(o.nextOp.slots)} signed up
              </div>
            </>
          ) : (
            <div className="muted">
              No raids scheduled. <a href={`${base}/rally?create=1#create-raid`}>Create one</a>
            </div>
          )}
        </section>

        <section
          className={`g-card card-col ${worth.length ? "ov-w3" : "ov-w4"}`}
          aria-labelledby="groups-title"
          data-tint="volt"
        >
          <div className="card-head">
            <h2 className="card-title" id="groups-title">
              Open groups
            </h2>
            <Link href={`${base}/rally`} transitionTypes={["nav"]}>
              All groups
            </Link>
          </div>
          <div className="readout__value">{o.openGroups}</div>
          <div className="g-help">
            LFG posts players can join right now, from Discord or from the Groups and raids page.
          </div>
        </section>
      </div>
    </>
  );
}
