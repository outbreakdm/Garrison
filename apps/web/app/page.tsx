import { brand, inviteUrl, modules } from "@garrison/brand";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { siteUrl } from "@/lib/hosts";
import { publicMetrics } from "@/lib/public-metrics";
import { SESSION_COOKIE } from "@/lib/session";
import { currentTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: { absolute: "Garrison · Guard the gate. Rally the squad." },
  description: brand.oneLiner,
  robots: { index: true, follow: true },
};

const PILLARS = [
  {
    label: "Guard",
    title: "Safe by default, for free",
    body: "Moderation with numbered cases and one-click undo, anti-raid that locks the server and pauses invites, and anti-nuke that strips a rogue admin before the damage spreads.",
  },
  {
    label: "Rally",
    title: "From LFG post to full squad",
    body: "LFG cards with role slots and a private voice room when the squad fills. Raid rosters with caps, a bench that promotes itself, and reminders that ping only the roster.",
  },
  {
    label: "Undo",
    title: "Every change can be taken back",
    body: "Timeouts, bans, lockdowns, dashboard settings and AI builds are all versioned. Undo is one button, and it only ever removes what it added.",
  },
  {
    label: "Fair",
    title: "Nothing hidden",
    body: "Every limit is written down: how long logs are kept, how often XP is earned, how many AI builds you get an hour. Free while Garrison is in early access.",
  },
];

const MODULE_LINES: { key: keyof typeof modules; line: string; soon?: boolean }[] = [
  {
    key: "watch",
    line: "/warn, /timeout, /ban, /purge with case numbers, escalation rules and undo.",
  },
  {
    key: "gatehouse",
    line: "Anti-raid, lockdowns that restore every channel exactly, verification and anti-nuke.",
  },
  { key: "ledger", line: "Who did what and when, searchable. Never message content." },
  {
    key: "rally",
    line: "LFG cards with role slots, and a private voice room when the squad fills.",
  },
  { key: "ops", line: "Raid rosters with role caps, a bench, weekly repeats and reminders." },
  {
    key: "ranks",
    line: "XP and leaderboards, off until you turn them on. Rewards can't carry admin powers.",
  },
  {
    key: "quartermaster",
    line: "Describe channels and roles, review the plan, apply. Undo any build.",
  },
  { key: "barracks", line: "Rosters and game account linking.", soon: true },
];

const SECURITY = [
  "Garrison asks only for the permissions it uses, never Administrator, and /health tells you when something's off.",
  "Anti-nuke and its trusted list are owner-only, so a compromised admin can't switch them off first.",
  "AI builds only add channels and roles, new roles get no permissions, and a person approves every plan.",
  "Message content is never stored. Logs keep who did what, and expire on a schedule you set.",
  "The dashboard signs in with Discord, keeps no Discord token, and re-checks your permissions on every page.",
];

export default async function Home() {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE));
  // On garrisonbot.com the dashboard lives at dash.garrisonbot.com; locally it's this host.
  const appUrl = process.env.APP_URL;
  const dashboard = `${siteUrl(appUrl) && appUrl ? appUrl : ""}/servers`;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const invite = clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId) : null;
  const [metrics, theme] = await Promise.all([publicMetrics(), currentTheme()]);

  return (
    <div className="landing">
      <header className="topbar landing__bar">
        <Logo />
        <nav className="landing__nav" aria-label="Site">
          <a href="#modules">Modules</a>
          <a href="#security">Security</a>
          <a href="#pricing">Pricing</a>
          <a href="/status">Status</a>
        </nav>
        <span className="topbar__spacer" />
        <ThemeToggle back="/" theme={theme} />
        <Link className="g-btn g-btn--ghost" href={dashboard}>
          {signedIn ? "Open dashboard" : "Sign in"}
        </Link>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <span className="g-label">Discord bot for gaming communities</span>
          <h1 className="hero__title">{brand.tagline}</h1>
          <p className="hero__lede">{brand.oneLiner}</p>
          {metrics?.latency ? (
            // The Fast pillar's proof: a live number, linked to where it comes from.
            <a className="live-number" href="/status">
              Commands answered in <strong>{metrics.latency.p95Ms} ms</strong> (p95, last 24 h)
              {metrics.uptimePct !== null ? ` · ${metrics.uptimePct.toFixed(2)}% uptime` : ""}
            </a>
          ) : null}
          <div className="g-row">
            {invite ? (
              <a className="g-btn g-btn--primary" href={invite}>
                Add to Discord
              </a>
            ) : null}
            <Link className="g-btn g-btn--secondary" href={dashboard}>
              Open the dashboard
            </Link>
          </div>
        </div>

        <figure className="hero__demo" aria-label="Examples of Garrison messages">
          <div className="g-embed g-embed--alert">
            <div className="g-embed__bar" />
            <div className="g-embed__body">
              <div className="g-embed__title">Server locked: raid detected</div>
              <div className="g-embed__text">
                14 joins in 30 s. Posting is off in 23 channels. Invites are paused. Lifts in 15
                min.
              </div>
              <div className="g-embed__foot">Gatehouse · lockdown 3f2a9c</div>
            </div>
          </div>
          <div className="g-lfg">
            <div className="g-lfg__head">
              <span className="g-lfg__title">Mythic+ 12 · Ara-Kara</span>
              <span className="g-badge g-badge--caution">1 left</span>
            </div>
            <div className="g-lfg__meta">@Taz · starts in 10 min · io 2500+</div>
            <div className="g-slots" role="img" aria-label="4 of 5 slots filled">
              <span className="g-slot g-slot--filled">T</span>
              <span className="g-slot g-slot--filled">H</span>
              <span className="g-slot g-slot--filled">D</span>
              <span className="g-slot g-slot--filled">D</span>
              <span className="g-slot">D</span>
            </div>
          </div>
          <div className="g-embed">
            <div className="g-embed__bar" />
            <div className="g-embed__body">
              <div className="g-embed__title">Timeout applied to Kel for 1 h</div>
              <div className="g-embed__text">Reason: 3 warnings in 24 h</div>
              <div className="g-embed__foot">Watch · case #1042 · Undo</div>
            </div>
          </div>
        </figure>
      </section>

      <main className="landing__main">
        <section className="pillars" aria-label="What Garrison stands for">
          {PILLARS.map((p) => (
            <div className="g-card card-col" key={p.label}>
              <span className="g-label">{p.label}</span>
              <h2>{p.title}</h2>
              <p className="muted">{p.body}</p>
            </div>
          ))}
        </section>

        <section id="modules" className="card-col">
          <div className="section-head">
            <span className="g-label">Modules</span>
            <h2 className="section-title">One bot for the whole server</h2>
          </div>
          <div className="module-grid">
            {MODULE_LINES.map((m) => (
              <div className="g-card card-col" key={m.key}>
                <div className="row-between">
                  <span className="big">{modules[m.key].name}</span>
                  {m.soon ? (
                    <span className="g-badge">Soon</span>
                  ) : (
                    <span className="g-nav__plain">{modules[m.key].plain}</span>
                  )}
                </div>
                <p className="muted">{m.line}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="security" className="g-card g-card--hud security">
          <div className="section-head">
            <span className="g-label">Security</span>
            <h2 className="section-title">Built so one bad login can't wreck your server</h2>
          </div>
          <ul className="checklist">
            {SECURITY.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="g-card card-col pricing">
          <span className="g-label">Pricing</span>
          <h2 className="section-title">Free during early access</h2>
          <p className="muted">
            Every module is free while Garrison is in early access. Paid plans will be published
            here, with every price and limit, before anything costs money. Everything a server needs
            to stay safe stays free.
          </p>
        </section>
      </main>

      <footer className="landing__foot">
        <Logo />
        <span className="muted">{brand.tagline}</span>
      </footer>
    </div>
  );
}
