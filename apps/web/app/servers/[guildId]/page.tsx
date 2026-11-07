import { inviteUrl } from "@garrison/brand";
import {
  capacity,
  getActivity,
  getHealthSnapshot,
  getLatency,
  getOverview,
  listQmBuilds,
  listRecentCases,
  listSignups,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionBadge, formatTime } from "@/components/format";
import { getDb } from "@/lib/db";
import { requireGuildAccess } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const db = getDb();
  const [o, cases, activity, latency, health, [build]] = await Promise.all([
    getOverview(db, guild.id),
    listRecentCases(db, guild.id, 5),
    getActivity(db, guild.id),
    getLatency(db, guild.id),
    getHealthSnapshot(db, guild.id),
    listQmBuilds(db, guild.id, 1),
  ]);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const fixUrl = clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId, guild.id) : null;
  const ago = (d: Date) => {
    const m = Math.round((Date.now() - d.getTime()) / 60_000);
    return m < 60
      ? `${m} min ago`
      : m < 2880
        ? `${Math.round(m / 60)} h ago`
        : `${Math.round(m / 1440)} d ago`;
  };
  const nextSignups = o.nextOp ? await listSignups(db, o.nextOp.id) : [];
  const g = o.gatehouse;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Server overview</h1>
          <p>{guild.name}</p>
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
                href={`/servers/${guild.id}/quartermaster`}
                title={`Undo with /qm undo version:${build.version} in Discord`}
              >
                Undo
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid-stats">
        <div className="g-card">
          <div className="g-label">Active members · 7 d</div>
          <div className="g-stat">{activity.activeMembers7d.toLocaleString("en-US")}</div>
          <div className="g-help">Posted at least once</div>
        </div>
        <div className="g-card">
          <div className="g-label">Messages today</div>
          <div className="g-stat">{activity.messagesToday.toLocaleString("en-US")}</div>
          <div className="g-help">UTC day · counts only, never content</div>
        </div>
        <div className="g-card">
          <div className="g-label">Mod actions · 24 h</div>
          <div className="g-stat">{o.modActions24h}</div>
          <div className="g-help">
            {o.automatic24h} automatic · {o.modActions24h - o.automatic24h} by staff
          </div>
        </div>
        <div className="g-card">
          <div className="g-label">Command reply · p95</div>
          <div className="g-stat">{latency ? `${latency.p95Ms} ms` : "—"}</div>
          <div className="g-help">
            {latency ? `Target under 200 ms · ${latency.count} in 24 h` : "No commands in 24 h"}
          </div>
        </div>
      </div>

      <div className="grid-cards">
        <div className="g-card g-card--hud card-col">
          <div className="row-between">
            <span className="g-label">Next op</span>
          </div>
          {o.nextOp ? (
            <>
              <div>
                <div className="big">{o.nextOp.title}</div>
                <div className="mono">{formatTime(o.nextOp.startsAt, o.nextOp.timezone)}</div>
              </div>
              {o.nextOp.slots.map((s) => {
                const n = nextSignups.filter((x) => x.role === s.name && !x.bench).length;
                return (
                  <div className="row-between" key={s.name}>
                    <span>{s.name}</span>
                    <span className="mono">
                      {n} / {s.count}
                    </span>
                  </div>
                );
              })}
              <div className="mono">
                {nextSignups.filter((x) => !x.bench).length} / {capacity(o.nextOp.slots)} signed up
              </div>
            </>
          ) : (
            <div className="muted">No raids scheduled. Create one with /raid create.</div>
          )}
        </div>

        <div className="g-card card-col">
          <span className="g-label">Gatehouse</span>
          <div className="row-between">
            <span>Lockdown</span>
            {o.activeLockdown ? (
              <span className="g-badge g-badge--alert">Active</span>
            ) : (
              <span className="g-badge g-badge--go">Off</span>
            )}
          </div>
          <div className="row-between">
            <span>Anti-raid</span>
            <span className={`g-badge ${g?.antiRaidEnabled ? "g-badge--go" : "g-badge--caution"}`}>
              {g?.antiRaidEnabled ? "Armed" : "Off"}
            </span>
          </div>
          <div className="row-between">
            <span>Anti-nuke</span>
            <span className={`g-badge ${g?.antiNukeEnabled ? "g-badge--go" : "g-badge--caution"}`}>
              {g?.antiNukeEnabled ? "Armed" : "Off"}
            </span>
          </div>
          <div className="row-between">
            <span>Verification</span>
            <span className={`g-badge ${g?.verifyRoleId ? "g-badge--go" : ""}`}>
              {g?.verifyRoleId ? "On" : "Off"}
            </span>
          </div>
        </div>

        <div className="g-card card-col">
          <div className="row-between">
            <span className="g-label">Recent cases · Watch</span>
            <Link href={`/servers/${guild.id}/watch`}>View all</Link>
          </div>
          {cases.length ? (
            cases.map((c) => (
              <div className="list-row" key={c.id}>
                <span>
                  <ActionBadge action={c.action} /> {c.targetTag ?? "channel"}
                </span>
                <span className="mono">#{c.caseNumber}</span>
              </div>
            ))
          ) : (
            <div className="muted">No cases yet.</div>
          )}
        </div>
      </div>
      <div className="grid-cards">
        <div className="g-card card-col">
          <div className="row-between">
            <span className="g-label">Health checks</span>
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
              Garrison checks this server every 30 minutes. Run /health for a check now.
            </span>
          )}
          {health && health.problems > 0 && fixUrl ? (
            <a className="g-btn g-btn--primary" href={fixUrl}>
              Fix permissions
            </a>
          ) : null}
        </div>
        <div className="g-card card-col">
          <span className="g-label">Open groups</span>
          <div className="g-stat">{o.openGroups}</div>
          <div className="g-help">
            Rally LFG posts · {o.quarantines24h} quarantined by anti-nuke in 24 h
          </div>
          <a href={`/servers/${guild.id}/rally`}>View all</a>
        </div>
      </div>
    </>
  );
}

/** Snapshot text can hold Discord mentions; the dashboard has no names for them, so say what kind each is. */
function plainMentions(text: string) {
  return text
    .replace(/<@&\d+>/g, "a role")
    .replace(/<#\d+>/g, "a channel")
    .replace(/<@!?\d+>/g, "a member");
}
