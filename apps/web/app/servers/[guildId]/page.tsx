import { capacity, getOverview, listRecentCases, listSignups } from "@garrison/db";
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
  const [o, cases] = await Promise.all([
    getOverview(db, guild.id),
    listRecentCases(db, guild.id, 5),
  ]);
  const nextSignups = o.nextOp ? await listSignups(db, o.nextOp.id) : [];
  const g = o.gatehouse;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Server overview</h1>
          <p>{guild.name}</p>
        </div>
      </div>

      <div className="grid-stats">
        <div className="g-card">
          <div className="g-label">Mod actions · 24 h</div>
          <div className="g-stat">{o.modActions24h}</div>
          <div className="g-help">
            {o.automatic24h} automatic · {o.modActions24h - o.automatic24h} by staff
          </div>
        </div>
        <div className="g-card">
          <div className="g-label">Open groups</div>
          <div className="g-stat">{o.openGroups}</div>
          <div className="g-help">Rally LFG posts</div>
        </div>
        <div className="g-card">
          <div className="g-label">Quarantined · 24 h</div>
          <div className="g-stat">{o.quarantines24h}</div>
          <div className="g-help">By anti-nuke</div>
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
    </>
  );
}
