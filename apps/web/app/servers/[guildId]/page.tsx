import { inviteUrl } from "@garrison/brand";
import {
  capacity,
  getActivity,
  getHealthSnapshot,
  getLatency,
  getOverview,
  listDashboardActions,
  listQmBuilds,
  listRecentCases,
  listSignups,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { ActionBadge, formatTime, plainMentions } from "@/components/format";
import { RequestsPanel } from "@/components/RequestsPanel";
import { getDb } from "@/lib/db";
import { ACTION_KIND } from "@/lib/rally-schema";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "./requests";

export const metadata: Metadata = { title: "Overview" };

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
  qm_apply: "/quartermaster",
  qm_cancel: "/quartermaster",
  undo_build: "/quartermaster",
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
  const [o, cases, activity, latency, health, [build], actions] = await Promise.all([
    getOverview(db, guild.id),
    listRecentCases(db, guild.id, 5),
    getActivity(db, guild.id),
    getLatency(db, guild.id),
    getHealthSnapshot(db, guild.id),
    listQmBuilds(db, guild.id, 1),
    listDashboardActions(db, guild.id, 30),
  ]);
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
      go: "Gatehouse",
    });
  if (o.quarantines24h > 0)
    attention.push({
      tone: "alert",
      title: `${plural(o.quarantines24h, "member", "members")} quarantined by anti-nuke`,
      detail: "Their roles were removed and saved. Restore them if it was a mistake.",
      href: `${base}/gatehouse`,
      go: "Gatehouse",
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
  if (build?.status === "pending")
    attention.push({
      tone: "caution",
      title: `Quartermaster plan v${build.version} is waiting`,
      detail: "Nothing changes in Discord until someone builds it. Plans expire after 15 minutes.",
      href: `${base}/quartermaster`,
      go: "Review plan",
    });
  if (o.nextOp && o.nextOp.startsAt.getTime() - now < 3 * 86_400_000) {
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
        go: "Rally",
      });
  }
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
      <div className="page-head">
        <div>
          <ViewTransition
            name={`guild-${guild.id}`}
            share={{ nav: "morph", default: "none" }}
            default="none"
          >
            <h1 className="page-title">{guild.name}</h1>
          </ViewTransition>
          <p>What needs you first, then how the server is doing.</p>
        </div>
        {build ? (
          <div className="build-line">
            <span className="mono">
              v{build.version} · {ago(build.createdAt)} by Quartermaster ·{" "}
              {build.status.replace("_", " ")}
            </span>
            {build.status === "applied" ? (
              <a
                className="g-btn g-btn--ghost"
                href={`${base}/quartermaster`}
                title={`Review and undo v${build.version}`}
              >
                Undo
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {attention.length ? (
        <section className="g-card attention" aria-labelledby="attention-title">
          <div className="attention__head">
            <h2 className="card-title" id="attention-title">
              Needs attention <span className="count">{attention.length}</span>
            </h2>
          </div>
          <ul className="attention__list">
            {attention.map((a) => (
              <li key={a.title}>
                <a
                  className={`attention__item ${a.tone === "alert" ? "attention__item--alert" : ""}`}
                  href={a.href}
                >
                  <span className="attention__text">
                    <strong>{a.title}</strong>
                    <span>{a.detail}</span>
                  </span>
                  <span className="attention__go">
                    {a.go}
                    <span className="cue" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RequestsPanel guildId={guild.id} kinds={["run_health"]} query={query} />

      <section className="g-card readout" aria-label="Activity">
        <div className="readout__cell">
          <span className="g-label">Active members · 7 d</span>
          <span className="readout__value">{activity.activeMembers7d.toLocaleString("en-US")}</span>
          <span className="g-help">Posted at least once</span>
        </div>
        <div className="readout__cell">
          <span className="g-label">Messages today</span>
          <span className="readout__value">{activity.messagesToday.toLocaleString("en-US")}</span>
          <span className="g-help">UTC day · counts only, never content</span>
        </div>
        <div className="readout__cell">
          <span className="g-label">Mod actions · 24 h</span>
          <span className="readout__value">{o.modActions24h}</span>
          <span className="g-help">
            {o.automatic24h} automatic · {o.modActions24h - o.automatic24h} by staff
          </span>
        </div>
        <div className="readout__cell">
          <span className="g-label">Command reply · p95</span>
          <span className="readout__value">
            {latency ? (
              <>
                {latency.p95Ms}
                <span className="unit">ms</span>
              </>
            ) : (
              "—"
            )}
          </span>
          <span className="g-help">
            {latency ? `Target under 200 ms · ${latency.count} in 24 h` : "No commands in 24 h"}
          </span>
        </div>
      </section>

      <div className="overview-grid">
        <section className="g-card g-card--hud card-col" aria-labelledby="next-op">
          <div className="card-head">
            <h2 className="card-title" id="next-op">
              Next op
            </h2>
            <Link href={`${base}/rally`} transitionTypes={["nav"]}>
              Rally
            </Link>
          </div>
          {o.nextOp ? (
            <>
              <div>
                <div className="big">{o.nextOp.title}</div>
                <div className="mono">{formatTime(o.nextOp.startsAt, o.nextOp.timezone)}</div>
              </div>
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

        <section className="g-card card-col" aria-labelledby="gatehouse-title">
          <div className="card-head">
            <h2 className="card-title" id="gatehouse-title">
              Gatehouse
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
                <span className="g-badge g-badge--go">Off</span>
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
              <span className={`g-badge ${g?.verifyRoleId ? "g-badge--go" : ""}`}>
                {g?.verifyRoleId ? "On" : "Off"}
              </span>
            </div>
          </div>
        </section>

        <section className="g-card card-col" aria-labelledby="cases-title">
          <div className="card-head">
            <h2 className="card-title" id="cases-title">
              Recent cases
            </h2>
            <Link href={`${base}/watch`} transitionTypes={["nav"]}>
              All cases
            </Link>
          </div>
          {cases.length ? (
            <div>
              {cases.map((c) => (
                <div className="list-row" key={c.id}>
                  <span>
                    <ActionBadge action={c.action} /> {c.targetTag ?? "channel"}
                  </span>
                  <span className="mono">#{c.caseNumber}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No cases yet. Warnings, timeouts and bans show up here.</div>
          )}
        </section>

        <section className="g-card card-col span-2" id="health" aria-labelledby="health-title">
          <div className="card-head">
            <h2 className="card-title" id="health-title">
              Health checks
            </h2>
            {health ? <span className="mono">{ago(health.computedAt)}</span> : null}
          </div>
          {health ? (
            health.checks.slice(0, 6).map((c) => (
              <div className="health-row" key={c.text}>
                <span
                  className={`g-badge ${c.status === "ok" ? "g-badge--go" : c.status === "fix" ? "g-badge--alert" : "g-badge--caution"}`}
                >
                  {c.status === "ok" ? "OK" : c.status === "fix" ? "Fix" : "Check"}
                </span>
                <span>{plainMentions(c.text)}</span>
              </div>
            ))
          ) : (
            <span className="muted">
              Garrison checks this server every 30 minutes. Run a check now to see it straight away.
            </span>
          )}
          <div className="g-row">
            {health && health.problems > 0 && fixUrl ? (
              <a className="g-btn g-btn--primary" href={fixUrl}>
                Fix permissions
              </a>
            ) : null}
            <form action={requestAction}>
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="page" value="" />
              <input type="hidden" name="kind" value="run_health" />
              <button type="submit" className="g-btn g-btn--secondary">
                Run health check
              </button>
            </form>
          </div>
        </section>

        <section className="g-card card-col" aria-labelledby="groups-title">
          <div className="card-head">
            <h2 className="card-title" id="groups-title">
              Open groups
            </h2>
            <Link href={`${base}/rally`} transitionTypes={["nav"]}>
              Rally
            </Link>
          </div>
          <div className="readout__value">{o.openGroups}</div>
          <div className="g-help">
            LFG posts players can join right now, from Discord or from the Rally page.
          </div>
        </section>
      </div>
    </>
  );
}
