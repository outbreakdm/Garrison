import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { siteUrl } from "@/lib/hosts";
import { publicMetrics } from "@/lib/public-metrics";

export const metadata: Metadata = { title: "Status", robots: { index: true, follow: true } };

export default async function StatusPage() {
  const m = await publicMetrics();
  const home = siteUrl(process.env.APP_URL) || "/";
  return (
    <div className="landing">
      <header className="topbar landing__bar">
        <Link href={home} aria-label="Garrison home">
          <Logo />
        </Link>
        <span className="topbar__spacer" />
        <Link className="g-btn g-btn--ghost" href={home}>
          Home
        </Link>
      </header>
      <main className="landing__main status">
        <div className="section-head">
          <h1>
            {m
              ? m.online
                ? "Garrison is online"
                : "Garrison is not responding"
              : "Status unavailable"}
          </h1>
          {m?.lastBeatAt ? (
            <p className="muted">
              Last heartbeat {m.lastBeatAt.toISOString().slice(0, 16).replace("T", " ")} UTC. The
              bot checks in every minute.
            </p>
          ) : null}
        </div>
        {m ? (
          <>
            <section className="g-card readout readout--3" aria-label="Now">
              <div className="readout__cell">
                <span className="g-label">Now</span>
                <span
                  className={`readout__value readout__value--text ${m.online ? "tone-go" : "tone-alert"}`}
                >
                  {m.online ? "Online" : "Down"}
                </span>
              </div>
              <div className="readout__cell">
                <span className="g-label">Uptime · 30 d</span>
                <span className="readout__value">
                  {m.uptimePct === null ? (
                    "—"
                  ) : (
                    <>
                      {m.uptimePct.toFixed(2)}
                      <span className="unit">%</span>
                    </>
                  )}
                </span>
              </div>
              <div className="readout__cell">
                <span className="g-label">Command reply · p95 · 24 h</span>
                <span className="readout__value">
                  {m.latency ? (
                    <>
                      {m.latency.p95Ms}
                      <span className="unit">ms</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="g-help">
                  {m.latency
                    ? `${m.latency.count.toLocaleString("en-US")} commands · target under 200 ms`
                    : "No commands yet"}
                </span>
              </div>
            </section>
            <div className="g-card card-col">
              <h2 className="card-title">Last 30 days</h2>
              <div
                className="uptime-bars"
                role="img"
                aria-label="Daily uptime for the last 30 days"
              >
                {last30Days().map((day) => {
                  const d = m.days.find((x) => x.day === day);
                  const tone = !d
                    ? ""
                    : d.pct >= 99.5
                      ? "uptime-bar--up"
                      : d.pct >= 95
                        ? "uptime-bar--partial"
                        : "uptime-bar--down";
                  return (
                    <span
                      key={day}
                      title={`${day}: ${d ? `${d.pct.toFixed(1)}%` : "no data"}`}
                      className={`uptime-bar ${tone}`}
                    />
                  );
                })}
              </div>
              <span className="g-help">
                Each bar is a UTC day: the share of minutes Garrison checked in, counted from when
                tracking began and up to now for today. Grey days have no data yet.
              </span>
            </div>
          </>
        ) : (
          <div className="g-card muted">The status page can't reach its data right now.</div>
        )}
      </main>
    </div>
  );
}

/** The last 30 UTC days, oldest first, so the bar keeps its shape before there's a month of data. */
function last30Days() {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) =>
    new Date(now - (29 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}
