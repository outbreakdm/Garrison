import { inviteUrl } from "@garrison/brand";
import {
  capacity,
  getActivity,
  getHealthSnapshot,
  getLatency,
  getOverview,
  getSetupFacts,
  listDashboardActions,
  listOpenQuarantines,
  listQmBuilds,
  listRecentCases,
  listSignups,
  listUpcomingOps,
} from "@garrison/db";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionBadge, formatTime, plainMentions, When } from "@/components/format";
import { NeedsAttention, SetupChecklist } from "@/components/NeedsAttention";
import { Outcome } from "@/components/Outcome";
import { CardHead, PageHead } from "@/components/PageHead";
import { RequestsPanel } from "@/components/RequestsPanel";
import { SettingsNotice } from "@/components/settings";
import { needsAttention, SHORT_RAID_WINDOW_MS, setupSteps, showSetup } from "@/lib/attention";
import { getDb } from "@/lib/db";
import { errorAt, latestOutcome } from "@/lib/outcome";
import { PAGES } from "@/lib/pages";
import { BUILD_STATUS } from "@/lib/qm-preview";
import { requireGuildAccess } from "@/lib/session";
import { requestAction } from "./requests";
import { hideSetup } from "./settings/actions";

export const metadata: Metadata = { title: PAGES.overview.title };

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const { guild, session } = await requireGuildAccess(guildId);
  const db = await getDb();
  const [o, cases, activity, latency, health, [build], quarantines, raids, actions, facts] =
    await Promise.all([
      getOverview(db, guild.id),
      listRecentCases(db, guild.id, 5),
      getActivity(db, guild.id),
      getLatency(db, guild.id),
      getHealthSnapshot(db, guild.id),
      listQmBuilds(db, guild.id, 1),
      listOpenQuarantines(db, guild.id),
      listUpcomingOps(db, guild.id),
      listDashboardActions(db, guild.id, 50),
      // Fails until migration 0022 is applied. The overview still works, without the checklist.
      getSetupFacts(db, guild.id).catch(() => null),
    ]);
  const now = new Date();
  // Signups only for the raids the page shows: the next one, and any starting soon.
  const soon = raids
    .filter((r) => r.startsAt.getTime() - now.getTime() <= SHORT_RAID_WINDOW_MS)
    .slice(0, 5);
  const shown = o.nextOp && !soon.some((r) => r.id === o.nextOp?.id) ? [...soon, o.nextOp] : soon;
  const signups = new Map(
    await Promise.all(shown.map(async (r) => [r.id, await listSignups(db, r.id)] as const)),
  );
  const attention = needsAttention({
    now,
    lockdown: o.activeLockdown,
    quarantines,
    build: build ?? null,
    raids: soon.map((r) => ({
      ...r,
      seated: (signups.get(r.id) ?? []).filter((x) => !x.bench),
    })),
    actions,
    health,
  });
  const steps = facts ? setupSteps(facts) : [];
  const healthOutcome = latestOutcome(actions, {
    userId: session.userId,
    kinds: ["run_health"],
    now,
  });
  const clientId = process.env.DISCORD_CLIENT_ID;
  const fixUrl = clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId, guild.id) : null;
  const next = o.nextOp;
  const nextSignups = next ? (signups.get(next.id) ?? []) : [];
  const seated = nextSignups.filter((x) => !x.bench);
  const g = o.gatehouse;
  const base = `/servers/${guild.id}`;
  const byStaff = o.modActions24h - o.automatic24h;
  const failing = health?.checks.filter((c) => c.status !== "ok") ?? [];
  /** A protection's state, as a badge. Off is a caution: it's the server's choice, but worth seeing. */
  const armed = (on: boolean | undefined, yes = "On", no = "Off") => (
    <span className={`g-badge ${on ? "g-badge--go" : "g-badge--caution"}`}>{on ? yes : no}</span>
  );

  return (
    <>
      <PageHead
        title={PAGES.overview.title}
        description={`How ${guild.name} is doing right now.`}
      />
      <SettingsNotice query={query} />
      <NeedsAttention guildId={guild.id} items={attention} />
      {facts && showSetup(facts, steps) ? (
        <SetupChecklist guildId={guild.id} steps={steps} hide={hideSetup} />
      ) : null}
      <RequestsPanel kinds={["run_health"]} query={query} actions={actions} />

      <section className="grid-stats" aria-label="Activity">
        <div className="g-card stat">
          <div className="stat__label">Active members</div>
          <div className="g-stat">{activity.activeMembers7d.toLocaleString("en-US")}</div>
          <div className="g-help">Posted at least once in the last 7 days</div>
        </div>
        <div className="g-card stat">
          <div className="stat__label">Messages today</div>
          <div className="g-stat">{activity.messagesToday.toLocaleString("en-US")}</div>
          <div className="g-help">Since midnight UTC. Counted, never read.</div>
        </div>
        <Link className="g-card stat stat--link" href={`${base}/watch#cases`}>
          <div className="stat__label">Moderation, last 24 h</div>
          <div className="g-stat">{o.modActions24h}</div>
          <div className="g-help">
            {o.modActions24h
              ? `${byStaff} by staff · ${o.automatic24h} automatic`
              : "No warnings, timeouts, kicks or bans"}
          </div>
        </Link>
        <div className="g-card stat">
          <div className="stat__label">Bot reply time</div>
          <div className="g-stat">{latency ? `${latency.p95Ms} ms` : "—"}</div>
          <div className="g-help">
            {latency
              ? `How fast 95% of commands were answered today. ${latency.p95Ms <= 200 ? "On target (under 200 ms)." : "Slower than the 200 ms target."}`
              : "No commands in the last 24 h"}
          </div>
        </div>
      </section>

      <div className="home-grid">
        <div className="card-col">
          <section className="g-card card-col" aria-labelledby="home-raid">
            <CardHead title={<span id="home-raid">Next raid</span>}>
              <Link href={`${base}/rally`}>
                {o.openGroups
                  ? `All raids · ${o.openGroups} open ${o.openGroups === 1 ? "group" : "groups"}`
                  : "All groups and raids"}
              </Link>
            </CardHead>
            {next ? (
              <>
                <div>
                  <div className="big">{next.title}</div>
                  <div className="muted">
                    {formatTime(next.startsAt, next.timezone)} · <When date={next.startsAt} />
                  </div>
                </div>
                <div className="fill-list">
                  {next.slots.map((s) => {
                    const n = seated.filter((x) => x.role === s.name).length;
                    return (
                      <div className="fill" key={s.name}>
                        <span>{s.name || "Players"}</span>
                        <meter
                          className="fill__bar"
                          min={0}
                          max={s.count}
                          value={Math.min(n, s.count)}
                          aria-label={`${s.name || "Players"}: ${n} of ${s.count}`}
                        />
                        <span className={`mono ${n >= s.count ? "tone-go" : ""}`}>
                          {n} / {s.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="row-between">
                  <span className="muted">
                    {seated.length} of {capacity(next.slots)} signed up
                    {nextSignups.length > seated.length
                      ? ` · ${nextSignups.length - seated.length} on the bench`
                      : ""}
                  </span>
                  <Link className="g-btn g-btn--secondary" href={`${base}/rally#raid-${next.id}`}>
                    Open raid
                  </Link>
                </div>
              </>
            ) : (
              <div className="empty">
                <span className="muted">No raids scheduled.</span>
                <Link
                  className="g-btn g-btn--secondary"
                  href={`${base}/rally?create=1#create-raid`}
                >
                  Create a raid
                </Link>
              </div>
            )}
          </section>

          <section className="g-card card-col" aria-labelledby="home-cases">
            <CardHead title={<span id="home-cases">Recent moderation</span>}>
              <Link href={`${base}/watch#cases`}>All cases</Link>
            </CardHead>
            {cases.length ? (
              <div>
                {cases.map((c) => (
                  <div className="list-row" key={c.id}>
                    <span className="case-line">
                      <ActionBadge action={c.action} />
                      {c.targetId ? (
                        <Link href={`${base}/watch/member/${c.targetId}`}>
                          {c.targetTag ?? c.targetId}
                        </Link>
                      ) : (
                        <span>{c.targetTag ?? "A channel"}</span>
                      )}
                      <span className="muted case-line__reason">
                        {c.reason ? plainMentions(c.reason) : "No reason given"}
                      </span>
                    </span>
                    <When date={c.createdAt} mono />
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">
                No cases yet. Warnings, timeouts, kicks and bans show here.
              </div>
            )}
          </section>
        </div>

        <div className="card-col">
          <section className="g-card card-col" aria-labelledby="home-security">
            <CardHead title={<span id="home-security">Security</span>}>
              <Link href={`${base}/gatehouse`}>Open Security</Link>
            </CardHead>
            <div>
              <div className="list-row">
                <span>Lockdown</span>
                {o.activeLockdown ? (
                  <span className="g-badge g-badge--alert">Locked</span>
                ) : (
                  <span className="g-badge">Not locked</span>
                )}
              </div>
              <div className="list-row">
                <span>Anti-raid</span>
                {armed(g?.antiRaidEnabled)}
              </div>
              <div className="list-row">
                <span>Anti-nuke</span>
                {armed(g?.antiNukeEnabled)}
              </div>
              <div className="list-row">
                <span>Verification</span>
                {g?.verifyRoleId ? (
                  <span className="g-badge g-badge--go">On</span>
                ) : (
                  <span className="g-badge">Off</span>
                )}
              </div>
            </div>
          </section>

          <section className="g-card card-col" id="health" aria-labelledby="home-health">
            <CardHead
              title={<span id="home-health">Health checks</span>}
              help="Whether Garrison has the permissions and settings it needs here."
            >
              {health ? (
                <span className="muted">
                  Checked <When date={health.computedAt} />
                </span>
              ) : null}
            </CardHead>
            {health ? (
              <>
                {failing.map((c) => (
                  <div className="health-row" key={c.text}>
                    <span
                      className={`g-badge ${c.status === "fix" ? "g-badge--alert" : "g-badge--caution"}`}
                    >
                      {c.status === "fix" ? "Fix" : "Check"}
                    </span>
                    <span>{plainMentions(c.text)}</span>
                  </div>
                ))}
                <div className="health-row">
                  <span className="g-badge g-badge--go">OK</span>
                  <span>
                    {failing.length
                      ? `${health.checks.length - failing.length} other checks passed.`
                      : `All ${health.checks.length} checks passed.`}
                  </span>
                </div>
                {health.checks.length > failing.length ? (
                  <details className="fold fold--plain">
                    <summary className="fold__summary">
                      <span>What passed</span>
                    </summary>
                    <div className="card-col fold__body">
                      {health.checks
                        .filter((c) => c.status === "ok")
                        .map((c) => (
                          <div className="health-row" key={c.text}>
                            <span className="g-badge g-badge--go">OK</span>
                            <span>{plainMentions(c.text)}</span>
                          </div>
                        ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : (
              <span className="muted">
                Garrison checks this server every 30 minutes. You can run a check now.
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
                <input type="hidden" name="at" value="health" />
                <button type="submit" className="g-btn g-btn--secondary">
                  Check again now
                </button>
              </form>
            </div>
            <Outcome action={healthOutcome} error={errorAt(query, "health")} />
          </section>

          {build ? (
            <section className="g-card card-col" aria-labelledby="home-build">
              <CardHead title={<span id="home-build">Last server build</span>}>
                <Link href={`${base}/quartermaster`}>Open Server builder</Link>
              </CardHead>
              <div className="row-between">
                <span>
                  <span className="mono">v{build.version}</span> {build.summary}
                </span>
                <span className={`g-badge ${BUILD_STATUS[build.status].tone}`}>
                  {BUILD_STATUS[build.status].label}
                </span>
              </div>
              <span className="muted">
                Asked by {build.requestedByTag} <When date={build.createdAt} />
              </span>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
