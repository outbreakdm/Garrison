import { brand, inviteUrl } from "@garrison/brand";
import { formatPrice, PRICING, yearlySaving } from "@garrison/db";
import type { Metadata } from "next";
import { Gabarito, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Art } from "@/components/Art";
import { BuildBox } from "@/components/BuildBox";
import { Sparkline } from "@/components/insights/Sparkline";
import { Logo } from "@/components/Logo";
import { ServerPreview } from "@/components/ServerPreview";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BUILD_IDEAS } from "@/lib/build-prompt";
import { siteUrl } from "@/lib/hosts";
import { LEGAL } from "@/lib/legal";
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
/**
 * Every module, in the dashboard's own groups and under the names its menu uses.
 * The page quotes this list's length, so adding a module here updates the count.
 */
const CATALOG: { group: string; items: [name: string, what: string][] }[] = [
  {
    group: "Safety",
    items: [
      [
        "Moderation",
        "Warnings, timeouts and bans as numbered cases, an escalation ladder, and automod for scam links and blocked words.",
      ],
      [
        "Security",
        "Anti-raid lockdowns, verification for newcomers, and anti-nuke that quarantines a rogue admin.",
      ],
      [
        "Logs",
        "Who did what and when, kept 7 to 365 days, with deleted and edited messages if you want them.",
      ],
    ],
  },
  {
    group: "Community",
    items: [
      [
        "Welcome",
        "Greet people as they join, see them off, and give new members their first roles.",
      ],
      ["Role menus", "Buttons or a dropdown, so members pick their own games, pings and colors."],
      [
        "Tickets",
        "Private channels between a member and your staff, with transcripts and a queue.",
      ],
      [
        "Leveling",
        "XP and a leaderboard, off until you turn them on. Rewards can't carry admin powers.",
      ],
      [
        "Giveaways",
        "Post a prize with an Enter button. Garrison draws the winners and announces them.",
      ],
      [
        "Starboard",
        "Messages that collect enough of one emoji are reposted to a channel of their own.",
      ],
      [
        "Suggestions",
        "Members post ideas with /suggest and vote For or Against. Staff mark the outcome.",
      ],
      [
        "Stream alerts",
        "A post when a Twitch channel goes live or a YouTube channel uploads a video.",
      ],
      ["Messages", "Announcements, rules and reminders as cards, posted now or on a schedule."],
    ],
  },
  {
    group: "Gaming",
    items: [
      [
        "Groups and raids",
        "LFG posts with role slots, and raid rosters with caps, a bench and reminders.",
      ],
      [
        "Voice rooms",
        "Join “New room” to get a voice channel of your own. It's deleted once empty.",
      ],
      [
        "Game accounts",
        "Members link their game accounts, and the roster marks which are verified.",
      ],
    ],
  },
  {
    group: "Server",
    items: [
      [
        "Insights",
        "Messages, active members, joins and leaves, and the busiest hours. Counts only.",
      ],
      [
        "AI assistant",
        "Describe channels and roles, see them on your server, then build. Any build can be undone.",
      ],
    ],
  },
];

/** How many modules Garrison has, in words, from the catalog above. */
const MODULE_COUNT = CATALOG.reduce((n, g) => n + g.items.length, 0);
const moduleCount = NUMBER_WORDS[MODULE_COUNT] ?? String(MODULE_COUNT);

const SECURITY = [
  "Garrison asks only for the permissions it uses, never Administrator, and /health tells you when something's off.",
  "Anti-nuke and its trusted list are owner-only, so a compromised admin can't switch them off first.",
  "The AI assistant only adds channels and roles, new roles get only member permissions, and a person approves every plan.",
  "Message text is kept only where it's the point: tickets, suggestions and appeals, and logs if you turn it on. Ticket and log text expires on a schedule.",
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
    a: "Who did what and when, for cases and logs, kept 30 days by default (you choose 7 to 365). Logs keep the text of deleted and edited messages only if you turn that on. Tickets keep their transcript for 30 days after closing, or 365 on Pro. With AI moderation on (Pro), OpenAI's moderation model checks messages; Garrison keeps none of that. The Privacy Policy lists everything.",
  },
  {
    q: "Can players use it too?",
    a: "Yes. Players join groups, sign up for raids and check their rank from Discord or the dashboard, and link their game accounts on their Account page.",
  },
];

const COST_ANSWER = `Every module works on Free, for any number of servers, and everything a server needs to stay safe stays free. Pro adds your own look, higher limits and history for one server; Agency covers up to five you run. A new subscription can be refunded within ${LEGAL.refundDays} days, as the Refund Policy explains.`;

/** The example server in the AI assistant shot: today's channels plus one plan's additions. */
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

/** The Insights shot: an example server's month, as the page's own stat tiles draw it. */
const DEMO_STATS: { label: string; value: string; delta: number; sub: string; trend: number[] }[] =
  [
    {
      label: "Messages",
      value: "48,210",
      delta: 18,
      sub: "in 30 days",
      trend: [1210, 1340, 1290, 1480, 1420, 1610, 1580, 1720, 1690, 1850, 1810, 1960],
    },
    {
      label: "Active members",
      value: "1,284",
      delta: 9,
      sub: "sent a message or talked",
      trend: [980, 1010, 1040, 1020, 1090, 1110, 1150, 1140, 1190, 1220, 1250, 1284],
    },
    {
      label: "Joined, net",
      value: "+212",
      delta: -4,
      sub: "joins minus leaves",
      trend: [22, 19, 25, 17, 21, 18, 16, 20, 15, 17, 14, 16],
    },
  ];

/** The Discord shot: real commands, as Discord's picker lists them after a "/". */
const DEMO_COMMANDS: [name: string, what: string][] = [
  ["lockdown", "Stop members posting, and pause invites, while you deal with a raid."],
  ["warn", "Warn a member. Warnings count toward escalation rules."],
  ["lfg", "Find a group: post an LFG card people can join."],
  ["raid", "Schedule raids and events with role signups and a bench."],
  ["health", "Check Garrison's permissions, role position and settings in this server."],
];

/** Where landing links send people for help. */
const HELP: { title: string; text: string; href: string; link: string }[] = [
  {
    title: "Start with /health",
    text: "Run it in your server: Garrison checks its own permissions, role position and settings, and says what to fix. The FAQ covers the rest.",
    href: "#faq",
    link: "Read the FAQ",
  },
  {
    title: "Is it just me?",
    text: "The status page shows how fast Garrison answers right now, and its uptime over the last day.",
    href: "/status",
    link: "Open the status page",
  },
  {
    title: "Write to a person",
    text: `Billing, a bug, or something Garrison did that it shouldn't have: email ${LEGAL.contact} and a person answers.`,
    href: `mailto:${LEGAL.contact}`,
    link: "Email support",
  },
];

/** A browser-ish frame around a real dashboard component, labeled as an example. */
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
            <span className="lp-dc__time">Today at 9:04 PM</span>
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
  const app = siteUrl(appUrl) && appUrl ? appUrl : "";
  const dashboard = `${app}/servers`;
  const ideaHref = (prompt: string) => `${app}/build?idea=${encodeURIComponent(prompt)}`;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const invite = clientId && /^\d+$/.test(clientId) ? inviteUrl(clientId) : null;
  const [metrics, theme] = await Promise.all([publicMetrics(), currentTheme()]);
  const openLabel = signedIn ? "Open your dashboard" : "Open the dashboard";
  const faq = [...FAQ, { q: "What does it cost?", a: COST_ANSWER }];

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
            <a href="#ideas">Ideas</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#help">Help</a>
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
              Moderation, anti-raid, logs, tickets, group finding and raid signups, and an AI
              assistant that builds your channels and roles. Start by telling it what your server is
              for.
            </p>
            <BuildBox action={`${app}/build`} signedIn={signedIn} />
            <div className="lp-ideas">
              <span className="lp-ideas__label">Or start from</span>
              <ul className="lp-ideas__list">
                {BUILD_IDEAS.slice(0, 4).map((idea) => (
                  <li key={idea.name}>
                    <a className="lp-idea" href={ideaHref(idea.prompt)}>
                      {idea.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-actions lp-hero__actions">
              {invite ? (
                <a className="lp-btn lp-btn--primary" href={invite}>
                  Add to Discord
                </a>
              ) : (
                <Link className="lp-btn lp-btn--ghost" href={dashboard}>
                  {openLabel}
                </Link>
              )}
              <a className="lp-btn lp-btn--ghost" href="#demo">
                See it in action
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <path
                    d="M8 3v10M4 9l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
            <p className="lp-assure">Every module free to start · Never asks for Administrator</p>
          </div>

          {/* The focal moment: lock the server from the dashboard, and the message lands in Discord. */}
          <div className="lp-stage" id="demo">
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
                            <span className="mono">9:04 PM</span>
                          </div>
                          <div className="list-row">
                            <span className="muted">Lifts</span>
                            <span className="mono">9:19 PM</span>
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
                foot="Security · lockdown 3f2a9c"
              />
            </DiscordWindow>
          </div>
        </section>

        <section className="lp-section" id="features" aria-labelledby="lp-features">
          <div className="lp-section__head">
            <h2 className="lp-h2" id="lp-features">
              One bot instead of five
            </h2>
            <p>
              {moduleCount} modules share one dashboard: no second bot for logs, no stats bot, no
              spreadsheet for raids, no settings commands to remember.
            </p>
          </div>

          <Feature
            id="ai-builder"
            icon="lp-icon-quartermaster"
            title="Describe the channels you want. Review. Build. Undo."
            visual={
              <AppWindow path="AI assistant" className="lp-win--qm">
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
              The AI assistant turns a sentence into a plan and shows your server with the changes
              before anything happens. It only adds channels and roles, new roles get no
              permissions, and any build can be undone, even after a partial failure.
            </p>
          </Feature>

          <Feature
            id="insights"
            icon="lp-icon-overview"
            title="Know what your server is doing"
            flip
            visual={
              <AppWindow path="Insights">
                <div className="lp-app lp-app--stack">
                  <div className="stat-tiles lp-stats">
                    {DEMO_STATS.map((t) => (
                      <div className="g-card stat-tile" key={t.label}>
                        <span className="stat-tile__label">{t.label}</span>
                        <span className="stat-tile__value">{t.value}</span>
                        <span className="stat-tile__foot">
                          <span
                            className={`stat-tile__delta ${t.delta > 0 ? "tone-go" : "tone-caution"}`}
                          >
                            {t.delta > 0 ? "▲" : "▼"} {Math.abs(t.delta)}%
                          </span>
                          <span className="g-help">{t.sub}</span>
                        </span>
                        <Sparkline
                          values={t.trend}
                          label={`${t.label} over the month: ${t.delta > 0 ? "up" : "down"} ${Math.abs(t.delta)}%`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </AppWindow>
            }
          >
            <p>
              Messages, active members, joins against leaves and who stayed a week, each with its
              trend over the range you pick. See which channels are alive and when people show up,
              without adding a stats bot.
            </p>
          </Feature>

          <Feature
            id="from-discord"
            icon="lp-icon-commands"
            title="Run it from Discord too"
            visual={
              <figure
                className="lp-dc lp-slash"
                aria-label="Example: Garrison's commands in Discord"
              >
                <div className="lp-dc__bar" aria-hidden="true">
                  <span className="lp-dc__hash">#</span>
                  staff-room
                </div>
                <div className="lp-slash__picker">
                  <div className="lp-slash__head">Garrison</div>
                  <ul className="lp-slash__list">
                    {DEMO_COMMANDS.map(([name, what], i) => (
                      <li key={name} className={i === 0 ? "lp-slash__row is-on" : "lp-slash__row"}>
                        <span className="lp-slash__name">/{name}</span>
                        <span className="lp-slash__what">{what}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lp-slash__input" aria-hidden="true">
                  <span className="lp-slash__typed">/</span>
                  <span className="lp-slash__caret" />
                </div>
              </figure>
            }
          >
            <p>
              Lock the server, warn a member, post a group or schedule a raid with a slash command.
              Discord's own permissions decide who sees each one, Garrison checks them again before
              acting, and /health says what to fix when something's off.
            </p>
          </Feature>

          <Feature
            id="moderation"
            icon="lp-icon-watch"
            title="Every action is a case, and every case can be undone"
            flip
            visual={
              <div className="lp-pair">
                <AppWindow path="Moderation">
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
                    foot="Moderation · case #1042"
                  />
                </DiscordWindow>
              </div>
            }
          >
            <p>
              Warn, time out, kick or ban from a member's page, or with /warn and friends in
              Discord. Cases are numbered and never reused, members can get a neutral DM with how to
              appeal, and the ladder you set handles repeat offenders. Automod removes scam links
              and blocked words before anyone has to.
            </p>
          </Feature>

          <Feature
            id="groups"
            icon="lp-icon-rally"
            title="From LFG post to full squad"
            visual={
              <AppWindow path="Groups and raids">
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

          <div className="lp-catalog" id="modules">
            <div className="lp-catalog__head">
              <h3>All {MODULE_COUNT} modules</h3>
              <p>Every one works on the Free plan, with the standard look and limits.</p>
            </div>
            {CATALOG.map((g) => (
              <section
                key={g.group}
                className="lp-catalog__group"
                aria-labelledby={`lp-cat-${g.group}`}
              >
                <h4 className="lp-catalog__name" id={`lp-cat-${g.group}`}>
                  {g.group}
                </h4>
                <ul className="lp-catalog__list">
                  {g.items.map(([name, what]) => (
                    <li key={name}>
                      <strong>{name}</strong>
                      <span>{what}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section className="lp-section lp-wall" id="ideas" aria-labelledby="lp-ideas">
          <div className="lp-section__head">
            <h2 className="lp-h2" id="lp-ideas">
              Start from an idea
            </h2>
            <p>
              Pick one and the AI assistant takes it from there: it plans the channels and roles,
              shows your server with the changes, and builds only what you approve.
            </p>
          </div>
          {/* Two copies side by side, so the scroll loops without a seam; the second is hidden from
              screen readers and the keyboard. It pauses under the pointer and for focus, and
              stands still as a wrapped grid with reduced motion. */}
          <div className="lp-wall__view">
            <div className="lp-wall__track">
              {[0, 1].map((copy) => (
                <ul className="lp-wall__row" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                  {BUILD_IDEAS.map((idea) => (
                    <li key={idea.name}>
                      <a
                        className="lp-wall__card"
                        href={ideaHref(idea.prompt)}
                        tabIndex={copy === 1 ? -1 : undefined}
                      >
                        <span className="lp-wall__name">{idea.name}</span>
                        <span className="lp-wall__prompt">{idea.prompt}</span>
                        <span className="lp-wall__tree">
                          {idea.channels.map((c) => (
                            <span key={c} className="lp-wall__chan">
                              {/^[a-z0-9-]+$/.test(c) ? (
                                <span className="lp-wall__hash" aria-hidden="true">
                                  #
                                </span>
                              ) : (
                                <svg
                                  className="lp-wall__hash"
                                  viewBox="0 0 16 16"
                                  width="13"
                                  height="13"
                                  aria-hidden="true"
                                >
                                  <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
                                  <path
                                    d="M11.5 5.5a3.5 3.5 0 0 1 0 5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              )}
                              {c}
                            </span>
                          ))}
                        </span>
                        <span className="lp-wall__go">
                          Build this
                          <span aria-hidden="true"> →</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
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
          <div className="lp-price__head">
            <h2 className="lp-h2" id="lp-pricing">
              Pricing
            </h2>
            <p>
              Everything a server needs to stay safe is free. Pay for the look, the limits and the
              history.
            </p>
          </div>
          <ul className="lp-tiers">
            {(["free", "pro", "agency"] as const).map((tier) => {
              const p = PRICING[tier];
              const paid = p.monthly > 0;
              return (
                <li key={tier} className={`lp-tier lp-tier--${tier}`}>
                  {tier === "pro" ? <span className="lp-tier__flag">Recommended</span> : null}
                  <h3 className="lp-tier__name">{p.name}</h3>
                  <p className="lp-tier__price">
                    <span className="lp-tier__amount">{paid ? formatPrice(p.monthly) : "$0"}</span>
                    <span className="lp-tier__per">
                      {paid
                        ? p.servers === 1
                          ? "a month, per server"
                          : `a month, up to ${p.servers} servers`
                        : "forever, any number of servers"}
                    </span>
                  </p>
                  <p className="lp-tier__year">
                    {paid
                      ? `or ${formatPrice(p.yearly)} a year, ${yearlySaving(p.monthly, p.yearly)}`
                      : "No card, no trial clock"}
                  </p>
                  <p className="lp-tier__pitch">{p.pitch}</p>
                  <ul className="lp-tier__list">
                    {p.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                  <div className="lp-tier__cta">
                    {paid ? (
                      <>
                        <Link className="lp-btn lp-btn--ghost lp-btn--sm" href={dashboard}>
                          Pick a server to upgrade
                        </Link>
                        <span className="lp-tier__note">From that server's Plan page.</span>
                      </>
                    ) : invite ? (
                      <a className="lp-btn lp-btn--ghost lp-btn--sm" href={invite}>
                        Add to Discord, free
                      </a>
                    ) : (
                      <span className="lp-tier__note">What every server gets</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="lp-price__foot">
            Prices in US dollars. Plans belong to servers, so moderators share them. Going back to
            Free never deletes anything: extras pause until you upgrade again.
          </p>
        </section>

        <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq">
          <h2 className="lp-h2" id="lp-faq">
            Questions owners ask
          </h2>
          <div className="lp-faq__list">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-section lp-help" id="help" aria-labelledby="lp-help">
          <h2 className="lp-h2" id="lp-help">
            Need a hand?
          </h2>
          <ul className="lp-help__list">
            {HELP.map((h) => (
              <li key={h.title} className="lp-help__card">
                <h3>{h.title}</h3>
                <p>{h.text}</p>
                <a href={h.href}>{h.link}</a>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-cta" aria-labelledby="lp-cta">
          <Art slot="lp-cta" className="lp-cta__art" decorative />
          <div className="lp-cta__copy">
            <h2 className="lp-h2" id="lp-cta">
              Add Garrison to your server
            </h2>
            <p>
              Free to start, on as many servers as you like. It asks only for the permissions it
              uses, and every change it makes can be undone.
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
            <a href="#help">Help</a>
            <a href="/status">Status</a>
            <Link href={dashboard}>Dashboard</Link>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/refunds">Refunds</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
