import { brand, inviteUrl, modules } from "@garrison/brand";
import type { Metadata } from "next";
import { Gabarito, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Art } from "@/components/Art";
import { Logo } from "@/components/Logo";
import { ServerPreview } from "@/components/ServerPreview";
import { ThemeToggle } from "@/components/ThemeToggle";
import { siteUrl } from "@/lib/hosts";
import { publicMetrics } from "@/lib/public-metrics";
import type { ServerPreview as Preview } from "@/lib/qm-preview";
import { SESSION_COOKIE } from "@/lib/session";
import { currentTheme } from "@/lib/theme";
import "./landing.css";

// The landing page's own faces, self-hosted at build time like the dashboard's (CSP font-src 'self').
const display = Gabarito({ subsets: ["latin"], weight: ["700", "800"], variable: "--lp-display" });
const sans = Geist({ subsets: ["latin"], variable: "--lp-sans" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--lp-mono" });

export const metadata: Metadata = {
  title: { absolute: "Garrison · Run your Discord server from one dashboard" },
  description: brand.oneLiner,
  robots: { index: true, follow: true },
};

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
];
/** How many modules Garrison has, in words, from the one module list. */
const MODULE_COUNT = Object.keys(modules).length;
const moduleCount = NUMBER_WORDS[MODULE_COUNT] ?? String(MODULE_COUNT);

const SECURITY = [
  "Garrison asks only for the permissions it uses, never Administrator, and /health tells you when something's off.",
  "Anti-nuke and its trusted list are owner-only, so a compromised admin can't switch them off first.",
  "AI builds only add channels and roles, new roles get no permissions, and a person approves every plan.",
  "Message text is kept only for ticket transcripts, and in logs if you turn it on. All of it expires on a schedule you set.",
  "The dashboard signs in with Discord, keeps no Discord token, and re-checks your permissions on every page.",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does Garrison need Administrator?",
    a: "No. The invite asks only for the permissions Garrison uses, and /health warns you if it was given Administrator anyway. Drag Garrison's role above the roles it should manage.",
  },
  {
    q: "How does the dashboard change things in Discord?",
    a: "It never acts in Discord itself. It queues a request, and Garrison checks your permission again before doing it, usually within seconds. The result shows on the page you asked from.",
  },
  {
    q: "What if a moderator makes a mistake?",
    a: "Warnings, timeouts and bans each have an Undo, lockdowns restore every channel exactly, and dashboard settings keep a history with one-click undo. Kicks and cleared messages can't be reversed.",
  },
  {
    q: "What does Garrison store about my members?",
    a: "Who did what and when, for cases and logs, kept 30 days by default (you choose 7 to 365). Logs keep the text of deleted and edited messages only if you turn that on. Tickets keep their transcript for 30 days after closing, or 365 on Pro. With AI moderation on (Pro), OpenAI's moderation model checks messages; Garrison keeps none of that.",
  },
  {
    q: "Can players use it too?",
    a: "Yes. Players join groups, sign up for raids and check their rank from Discord or the dashboard, and link their game accounts on their Account page.",
  },
  {
    q: "What does it cost?",
    a: "Nothing during early access. Paid plans will be published here, with every price and limit, before anything costs money. Everything a server needs to stay safe stays free.",
  },
];

/** The example server in the Quartermaster shot: today's channels plus one plan's additions. */
const DEMO_PREVIEW: Preview = {
  loose: [],
  categories: [
    {
      key: "town",
      name: "Town Square",
      isNew: false,
      touched: false,
      channels: [
        { key: "general", name: "general", kind: "text", locked: false, isNew: false, details: [] },
        { key: "clips", name: "clips", kind: "text", locked: false, isNew: false, details: [] },
        { key: "lounge", name: "Lounge", kind: "voice", locked: false, isNew: false, details: [] },
      ],
    },
    {
      key: "val",
      name: "Valorant",
      isNew: true,
      touched: true,
      channels: [
        {
          key: "casual",
          name: "casual-lfg",
          kind: "text",
          locked: false,
          isNew: true,
          details: ["slowmode 30 s"],
        },
        {
          key: "ranked",
          name: "ranked-lfg",
          kind: "text",
          locked: true,
          isNew: true,
          details: ["only Gold+ can see it"],
        },
        {
          key: "stack",
          name: "Stack 1",
          kind: "voice",
          locked: false,
          isNew: true,
          details: ["5 people"],
        },
      ],
    },
  ],
  roles: [
    { key: "gold", name: "Gold+", color: 0xffc83a, isNew: true, details: ["no permissions"] },
    { key: "mods", name: "Mods", color: 0x5ab0ff, isNew: false, details: [] },
    { key: "raiders", name: "Raiders", color: 0x2bd99f, isNew: false, details: [] },
  ],
  added: { categories: 1, channels: 3, roles: 1 },
};

/** A browser-ish frame around a real dashboard component, labelled as an example. */
function AppWindow({
  path,
  className = "",
  children,
}: {
  path: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={`lp-win ${className}`} aria-label={`Example: the dashboard, ${path}`}>
      <div className="lp-win__bar" aria-hidden="true">
        <span className="lp-win__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-win__url">
          <span className="lp-win__host">dash.garrisonbot.com · </span>
          {path}
        </span>
        <span className="lp-win__tag">
          Example<span className="lp-win__tag-more"> server</span>
        </span>
      </div>
      <div className="lp-win__body">{children}</div>
    </figure>
  );
}

/** Discord's own message layout, with Garrison's embed. */
function DiscordWindow({
  channel,
  className = "",
  children,
}: {
  channel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={`lp-dc ${className}`}
      aria-label={`Example: Garrison's message in #${channel}`}
    >
      <div className="lp-dc__bar" aria-hidden="true">
        <span className="lp-dc__hash">#</span>
        {channel}
      </div>
      <div className="lp-dc__msg">
        <span className="lp-dc__avatar" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
            <path
              d="M58 20V12L52 6H12L6 12V38C6 50 18 56 32 61C46 56 58 50 58 38V34H33"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
            />
          </svg>
        </span>
        <div className="lp-dc__content">
          <div className="lp-dc__author">
            Garrison <span className="lp-dc__app">App</span>
            <span className="lp-dc__time">Today at 21:04</span>
          </div>
          {children}
        </div>
      </div>
    </figure>
  );
}

function Embed({
  tone,
  title,
  lines,
  field,
  foot,
}: {
  tone: "alert" | "caution" | "volt";
  title: string;
  lines: string[];
  field?: [string, string];
  foot: string;
}) {
  return (
    <div className={`lp-embed lp-embed--${tone}`}>
      <div className="lp-embed__title">{title}</div>
      {lines.map((l) => (
        <div className="lp-embed__line" key={l}>
          {l}
        </div>
      ))}
      {field ? (
        <div className="lp-embed__field">
          <span>{field[0]}</span>
          {field[1]}
        </div>
      ) : null}
      <div className="lp-embed__foot">{foot}</div>
    </div>
  );
}

function Feature({
  id,
  icon,
  title,
  children,
  visual,
  flip = false,
}: {
  id: string;
  icon: string;
  title: string;
  children: ReactNode;
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <article className={`lp-feature ${flip ? "lp-feature--flip" : ""}`} id={id}>
      <div className="lp-feature__copy">
        <Art slot={icon} className="lp-feature__icon" decorative />
        <h3>{title}</h3>
        {children}
      </div>
      <div className="lp-feature__visual">{visual}</div>
    </article>
  );
}

export default async function Home() {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE));
  // On garrisonbot.com the dashboard lives at dash.garrisonbot.com; locally it's this host.
  const appUrl = process.env.APP_URL;
  const dashboard = `${siteUrl(appUrl) && appUrl ? appUrl : ""}/servers`;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const invite = clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId) : null;
  const [metrics, theme] = await Promise.all([publicMetrics(), currentTheme()]);
  const openLabel = signedIn ? "Open your dashboard" : "Open the dashboard";

  const actions = (
    <div className="lp-actions">
      {invite ? (
        <a className="lp-btn lp-btn--primary" href={invite}>
          Add to Discord
        </a>
      ) : null}
      <Link className="lp-btn lp-btn--ghost" href={dashboard}>
        {openLabel}
      </Link>
    </div>
  );

  return (
    <div className={`lp ${display.variable} ${sans.variable} ${mono.variable}`}>
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <Link href="/" className="lp-nav__brand" aria-label="Garrison home">
            <Logo />
          </Link>
          <nav className="lp-nav__links" aria-label="Site">
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/status">Status</a>
          </nav>
          <span className="lp-nav__spacer" />
          <ThemeToggle back="/" theme={theme} />
          <Link className="lp-nav__signin" href={dashboard}>
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
          {invite ? (
            <a className="lp-btn lp-btn--primary lp-btn--sm" href={invite}>
              Add to Discord
            </a>
          ) : null}
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="lp-title">
          <Art slot="lp-hero" className="lp-hero__art" decorative eager />
          <div className="lp-hero__copy">
            {metrics?.latency ? (
              <a className="lp-live" href="/status">
                <span className="lp-live__dot" aria-hidden="true" />
                Commands answered in <strong>{metrics.latency.p95Ms} ms</strong>
                <span className="lp-live__sep">p95, last 24 h</span>
                {metrics.uptimePct !== null ? (
                  <span className="lp-live__sep">{metrics.uptimePct.toFixed(2)}% uptime</span>
                ) : null}
              </a>
            ) : null}
            <h1 id="lp-title">Run your Discord server from one dashboard.</h1>
            <p className="lp-lede">
              Moderation, security, logs, LFG, raid signups and an AI server builder. You run it
              from the web; Garrison does the work in Discord and checks again before every change.
            </p>
            {actions}
            <p className="lp-assure">Free during early access · Never asks for Administrator</p>
          </div>

          {/* The focal moment: lock the server from the dashboard, and the message lands in Discord. */}
          <div className="lp-stage">
            <AppWindow path="Security" className="lp-stage__app">
              <div className="lp-app">
                <div className="lp-app__head">
                  <h2 className="lp-app__title">Security</h2>
                </div>
                <div className="lp-app__grid">
                  {/* Two states of the same card: before the press, and the locked card it becomes. */}
                  <div className="g-card card-col lp-lock">
                    <h3 className="card-title">Lockdown</h3>
                    <div className="lp-lock__states">
                      <div className="card-col lp-lock__before" aria-hidden="true">
                        <span className="muted">
                          Not locked. Locking stops @everyone talking in every channel; staff roles
                          keep talking.
                        </span>
                        <div className="lp-lock__form">
                          <span className="g-field">
                            <span>Lift automatically after</span>
                            <span className="g-input lp-fake-select">15 minutes</span>
                          </span>
                          <span className="check">
                            <span className="lp-fake-check" aria-hidden="true" />
                            Pause invites
                          </span>
                        </div>
                        <span className="g-btn g-btn--danger lp-lock__btn">
                          Lock the server now
                          <span className="lp-cursor" aria-hidden="true">
                            <svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true">
                              <path d="M1 1v15l4-4 3 6 3-1.5-3-6h5.5z" />
                            </svg>
                          </span>
                        </span>
                      </div>
                      <div className="card-col lp-lock__after">
                        <span className="g-badge g-badge--alert">Active</span>
                        <div>
                          <div className="list-row">
                            <span className="muted">Started</span>
                            <span className="mono">21:04</span>
                          </div>
                          <div className="list-row">
                            <span className="muted">Lifts</span>
                            <span className="mono">21:19</span>
                          </div>
                          <div className="list-row">
                            <span className="muted">Invites</span>
                            <span className="mono">Paused</span>
                          </div>
                          <div className="list-row">
                            <span className="muted">Reason</span>
                            <span className="mono">Locked from the dashboard</span>
                          </div>
                        </div>
                        <span className="g-btn g-btn--primary">Lift lockdown</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-app__side">
                    <div className="g-card table-card lp-req">
                      <div className="table-card__head row-between">
                        <h3 className="card-title">Requests</h3>
                      </div>
                      <div className="lp-req__row">
                        <span className="lp-req__badge">
                          <span className="g-badge lp-req__queued" aria-hidden="true">
                            Queued
                          </span>
                          <span className="g-badge g-badge--go lp-req__done">Done</span>
                        </span>
                        <span className="lp-req__what">
                          <strong>Lock the server</strong>
                          <span className="lp-req__msg">
                            <span className="lp-req__waiting" aria-hidden="true">
                              Waiting for Garrison
                            </span>
                            <span className="lp-req__result">
                              Server locked: 23 channels. It lifts in 15 min.
                            </span>
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AppWindow>
            <DiscordWindow channel="mod-log" className="lp-stage__dc">
              <Embed
                tone="alert"
                title="Server locked"
                lines={[
                  "Posting is off in 23 channels.",
                  "Invites are paused.",
                  "Lifts in 15 minutes, or run /lockdown end.",
                ]}
                field={["Reason", "Locked from the dashboard"]}
                foot="Gatehouse · lockdown 3f2a9c"
              />
            </DiscordWindow>
          </div>
        </section>

        <section className="lp-section lp-steps" aria-labelledby="lp-steps">
          <h2 className="lp-h2" id="lp-steps">
            Three steps from invite to running
          </h2>
          <ol className="lp-steps__list">
            <li>
              <span className="lp-steps__n">1</span>
              <h3>Add Garrison</h3>
              <p>
                Pick a server. Garrison asks only for the permissions it uses, never Administrator.
              </p>
            </li>
            <li>
              <span className="lp-steps__n">2</span>
              <h3>Open the dashboard</h3>
              <p>
                Sign in with Discord to see every server you manage, and what needs you in each.
              </p>
            </li>
            <li>
              <span className="lp-steps__n">3</span>
              <h3>Run it from there</h3>
              <p>
                Lock the server, post a raid, warn a member or build channels. Garrison does it in
                Discord, usually within seconds, and every change can be undone.
              </p>
            </li>
          </ol>
        </section>

        <section className="lp-section" id="features" aria-labelledby="lp-features">
          <div className="lp-section__head">
            <h2 className="lp-h2" id="lp-features">
              Everything a server needs, in one place
            </h2>
            <p>
              {moduleCount} modules share one dashboard: no second bot for logs, no spreadsheet for
              raids, no settings commands to remember.
            </p>
          </div>

          <Feature
            id="overview"
            icon="lp-icon-overview"
            title="Open a server and see what needs you"
            visual={
              <AppWindow path="Overview">
                <div className="lp-app lp-app--stack">
                  <section className="g-card attention" aria-label="Needs attention">
                    <div className="attention__head">
                      <h3 className="card-title">
                        Needs attention <span className="count">2</span>
                      </h3>
                    </div>
                    <ul className="attention__list">
                      <li>
                        <span className="attention__item">
                          <span className="attention__text">
                            <strong>Quartermaster plan v4 is waiting</strong>
                            <span>Nothing changes in Discord until someone builds it.</span>
                          </span>
                          <span className="attention__go">
                            Review plan
                            <span className="cue" aria-hidden="true" />
                          </span>
                        </span>
                      </li>
                      <li>
                        <span className="attention__item">
                          <span className="attention__text">
                            <strong>Molten Core is 3 short</strong>
                            <span>Thu, 8:00 PM · 1 Tank, 2 Healer</span>
                          </span>
                          <span className="attention__go">
                            Rally
                            <span className="cue" aria-hidden="true" />
                          </span>
                        </span>
                      </li>
                    </ul>
                  </section>
                  <div className="g-card readout readout--3 lp-hide-sm">
                    <div className="readout__cell">
                      <span className="g-label">Active members · 7 d</span>
                      <span className="readout__value">1,284</span>
                    </div>
                    <div className="readout__cell">
                      <span className="g-label">Messages today</span>
                      <span className="readout__value">3,912</span>
                    </div>
                    <div className="readout__cell">
                      <span className="g-label">Mod actions · 24 h</span>
                      <span className="readout__value">7</span>
                    </div>
                  </div>
                </div>
              </AppWindow>
            }
          >
            <p>
              Lockdowns, quarantined members, raids short of players, plans waiting for review and
              failed requests come first, each linked to the page that fixes it. Below them: who was
              active, how busy it was, and how much moderation the day needed.
            </p>
          </Feature>

          <Feature
            id="moderation"
            icon="lp-icon-watch"
            title="Every action is a case, and every case can be undone"
            flip
            visual={
              <div className="lp-pair">
                <AppWindow path="Watch">
                  <div className="lp-app lp-app--stack">
                    <div className="g-card card-col">
                      <h3 className="card-title">Escalation ladder</h3>
                      <div className="ladder">
                        <div className="ladder__step">
                          <span className="mono">1–2 warnings</span>
                          <span className="big">Recorded</span>
                        </div>
                        <div className="ladder__step">
                          <span className="mono tone-caution">3 warnings in 24 h</span>
                          <span className="big">Timeout 1 h</span>
                        </div>
                        <div className="ladder__step ladder__step--alert">
                          <span className="mono tone-alert">5 warnings in 7 d</span>
                          <span className="big">Ban</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </AppWindow>
                <DiscordWindow channel="mod-log" className="lp-pair__dc">
                  <Embed
                    tone="volt"
                    title="Timeout applied to Kel for 1 h"
                    lines={["Reason: 3 warnings in 24 h"]}
                    foot="Watch · case #1042 · Undo"
                  />
                </DiscordWindow>
              </div>
            }
          >
            <p>
              Warn, time out, kick or ban from a member's page, or with /warn and friends in
              Discord. Cases are numbered and never reused, members can get a neutral DM with how to
              appeal, and the ladder you set handles repeat offenders.
            </p>
          </Feature>

          <Feature
            id="gatehouse"
            icon="lp-icon-gatehouse"
            title="A raid gets locked down before it spreads"
            visual={
              <DiscordWindow channel="alerts">
                <Embed
                  tone="alert"
                  title="Server locked: raid detected"
                  lines={[
                    "Raid detected: 14 joins in 30 s.",
                    "Posting is off in 23 channels.",
                    "Invites are paused.",
                    "Lifts in 15 minutes, or run /lockdown end.",
                  ]}
                  foot="Gatehouse · lockdown 8c1e07"
                />
              </DiscordWindow>
            }
          >
            <p>
              Anti-raid watches the join rate, locks the server, pauses invites and lifts itself. A
              lockdown restores every channel exactly as it was. Anti-nuke quarantines anyone who
              starts deleting channels or banning in bulk, and only the owner can switch it off.
            </p>
          </Feature>

          <Feature
            id="rally"
            icon="lp-icon-rally"
            title="From LFG post to full squad"
            flip
            visual={
              <AppWindow path="Rally">
                <div className="lp-app lp-app--stack">
                  <article className="g-card lfg" aria-label="Example group">
                    <div className="lfg__head">
                      <div>
                        <h3 className="card-title">Mythic+ 12 · Ara-Kara</h3>
                        <div className="lfg__meta">io 2500+ · Thu, 9:30 PM</div>
                      </div>
                      <span className="g-badge g-badge--accent">1 open</span>
                    </div>
                    <ul className="seats">
                      <li className="seat-row">
                        <span className="g-label">Tank</span>
                        <span className="seat-chips">
                          <span className="seat">
                            <span className="seat__mark">T</span>
                            <span className="seat__name">Taz</span>
                          </span>
                        </span>
                      </li>
                      <li className="seat-row">
                        <span className="g-label">Healer</span>
                        <span className="seat-chips">
                          <span className="seat">
                            <span className="seat__mark">O</span>
                            <span className="seat__name">ostara</span>
                          </span>
                        </span>
                      </li>
                      <li className="seat-row">
                        <span className="g-label">DPS</span>
                        <span className="seat-chips">
                          <span className="seat">
                            <span className="seat__mark">K</span>
                            <span className="seat__name">kestrel</span>
                          </span>
                          <span className="seat">
                            <span className="seat__mark">R</span>
                            <span className="seat__name">ravn</span>
                          </span>
                          <span className="seat seat--open">1 open</span>
                        </span>
                      </li>
                    </ul>
                  </article>
                </div>
              </AppWindow>
            }
          >
            <p>
              Players post a group with role slots and join with one button, from Discord or the
              dashboard. When the squad fills, Garrison opens a voice channel only they can join.
              Raids get rosters with caps, a bench that promotes itself, and reminders that ping
              only the roster.
            </p>
          </Feature>

          <Feature
            id="quartermaster"
            icon="lp-icon-quartermaster"
            title="Describe the channels you want. Review. Build. Undo."
            visual={
              <AppWindow path="Quartermaster" className="lp-win--qm">
                <div className="lp-app lp-app--stack">
                  <p className="lp-qm-ask">
                    “A Valorant section with ranked and casual LFG, a voice room, and a Gold+ role
                    that's the only one who can see ranked.”
                  </p>
                  <ServerPreview name="Example server" preview={DEMO_PREVIEW} planned />
                </div>
              </AppWindow>
            }
          >
            <p>
              Quartermaster turns a sentence into a plan and shows your server with the changes
              before anything happens. It only adds channels and roles, new roles get no
              permissions, and any build can be undone, even after a partial failure.
            </p>
          </Feature>

          <div className="lp-also">
            <h3 className="lp-also__title">Also in the box</h3>
            <ul className="lp-also__list">
              <li>
                <Art slot="lp-icon-ledger" className="lp-also__icon" decorative />
                <strong>{modules.ledger.name}</strong>
                <span>{modules.ledger.plain}</span>
                <p>
                  Who did what and when, searchable by member, with deleted and edited messages if
                  you want them.
                </p>
              </li>
              <li>
                <Art slot="lp-icon-ranks" className="lp-also__icon" decorative />
                <strong>{modules.ranks.name}</strong>
                <span>{modules.ranks.plain}</span>
                <p>
                  XP and a leaderboard, off until you turn them on. Rewards can't carry admin
                  powers.
                </p>
              </li>
              <li>
                <Art slot="lp-icon-barracks" className="lp-also__icon" decorative />
                <strong>{modules.barracks.name}</strong>
                <span>{modules.barracks.plain}</span>
                <p>
                  Members share their linked game accounts; the roster marks which are verified.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-section lp-trust" id="security" aria-labelledby="lp-security">
          <div className="lp-trust__copy">
            <h2 className="lp-h2" id="lp-security">
              Built so one bad login can't wreck your server
            </h2>
            <p>
              Garrison is careful by default. The checks are written down, so you can see exactly
              what it will and won't do.
            </p>
          </div>
          <ul className="lp-trust__list">
            {SECURITY.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-price" id="pricing" aria-labelledby="lp-pricing">
          <div className="lp-price__card">
            <h2 className="lp-h2" id="lp-pricing">
              Free during early access
            </h2>
            <p>
              Every module and the whole dashboard, free while Garrison is in early access. Paid
              plans will be published here, with every price and limit, before anything costs money.
              Everything a server needs to stay safe stays free.
            </p>
            <ul className="lp-price__list">
              <li>All {moduleCount.toLowerCase()} modules</li>
              <li>The dashboard, for every server you manage</li>
              <li>Undo and history on every change</li>
            </ul>
          </div>
        </section>

        <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq">
          <h2 className="lp-h2" id="lp-faq">
            Questions owners ask
          </h2>
          <div className="lp-faq__list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="lp-cta">
          <Art slot="lp-cta" className="lp-cta__art" decorative />
          <div className="lp-cta__copy">
            <h2 className="lp-h2" id="lp-cta">
              Add Garrison to your server
            </h2>
            <p>
              Free during early access. It asks only for the permissions it uses, and every change
              it makes can be undone.
            </p>
            {actions}
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot__inner">
          <div className="lp-foot__brand">
            <Logo />
            <p>{brand.tagline}</p>
          </div>
          <nav aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#security">Security</a>
            <a href="#pricing">Pricing</a>
            <a href="/status">Status</a>
            <Link href={dashboard}>Dashboard</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
