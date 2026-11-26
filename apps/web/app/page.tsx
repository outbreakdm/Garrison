import { brand, inviteUrl } from "@garrison/brand";
import { formatPrice, PRICING, SUPPLY_PACKS, yearlySaving } from "@garrison/db";
import type { Metadata } from "next";
import { Gabarito, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Art } from "@/components/Art";
import { BuildBox } from "@/components/BuildBox";
import { DemoClip } from "@/components/DemoClip";
import { DurationBar } from "@/components/DurationBar";
import { Sparkline } from "@/components/insights/Sparkline";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BUILD_IDEAS } from "@/lib/build-prompt";
import { siteUrl } from "@/lib/hosts";
import { LEGAL } from "@/lib/legal";
import { publicMetrics } from "@/lib/public-metrics";
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
    a: "Who did what and when, for cases and logs, kept 30 days by default (you choose 7 to 365). Logs keep the text of deleted and edited messages only if you turn that on. Tickets keep their transcript for 30 days after closing, or 365 on Pro. With AI moderation on, OpenAI's moderation model checks messages; Garrison keeps none of that. The Privacy Policy lists everything.",
  },
  {
    q: "Can players use it too?",
    a: "Yes. Players join groups, sign up for raids and check their rank from Discord or the dashboard, and link their game accounts on their Account page.",
  },
];

const COST_ANSWER = `Every module works on Free, for any number of servers, and everything a server needs to stay safe stays free. Pro adds your own look, higher limits and history for one server; Agency covers up to five you run. A new subscription can be refunded within ${LEGAL.refundDays} days, as the Refund Policy explains.`;

/** The Insights shot: an example server's month, as the page's own stat tiles draw it. */
const DEMO_STATS: {
  label: string;
  value: string;
  delta?: number;
  tone?: "go";
  sub: string;
  trend?: number[];
}[] = [
  {
    label: "Messages",
    value: "48,210",
    delta: 18,
    sub: "1,607 a day",
    trend: [1210, 1340, 1290, 1480, 1420, 1610, 1580, 1720, 1690, 1850, 1810, 1960],
  },
  {
    label: "Active members",
    value: "1,284",
    delta: 9,
    sub: "Posted at least once · 312 a day",
    trend: [980, 1010, 1040, 1020, 1090, 1110, 1150, 1140, 1190, 1220, 1250, 1284],
  },
  {
    label: "Joined, net",
    value: "+212",
    tone: "go",
    sub: "486 joined · 274 left",
    trend: [22, 19, 25, 17, 21, 18, 16, 20, 15, 17, 14, 16],
  },
  {
    label: "Stayed a week",
    value: "64%",
    sub: "311 of 486 who joined over a week ago",
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

/**
 * "Watch it work": four short 1080p60 clips of the dashboard's real screens, labels and steps,
 * made in HyperFrames, each with a poster of where it ends. One player shows them; each id has
 * a rule in landing.css (.lp-watch__player) that shows its recording when its step is picked.
 */
const WATCH: {
  id: string;
  tab: string;
  title: string;
  line: string;
  video: string;
  poster: string;
  alt: string;
}[] = [
  {
    id: "ai",
    tab: "Ask the AI assistant",
    title: "Say what you need. See it before it happens.",
    line: "Type it in plain words and pick Fast or Smart. Your server marks every channel and role the draft adds, and nothing changes in Discord until you press Apply.",
    video: "/media/garrison-ai-assistant.mp4",
    poster: "/media/garrison-ai-assistant.webp",
    alt: "On the AI assistant page, a request for a Valorant section is typed and sent with Bastion v1 Smart. The reply describes the plan, and the Your server panel beside the chat marks the new Valorant category, its three channels and the Gold+ role as New. The pointer presses Apply 5 changes, and a toast says the changes are built.",
  },
  {
    id: "preview",
    tab: "Write it, see it",
    title: "Write it here, see it in Discord.",
    line: "Every card has its Discord preview beside it, changing as you type. Type @ to add the member's name or the server's, and it saves itself when you pause.",
    video: "/media/garrison-live-preview.mp4",
    poster: "/media/garrison-live-preview.webp",
    alt: "Typing a new welcome card title, then @ and Name to add the member's name. The Discord preview beside the editor changes with every letter, and the card saves itself.",
  },
  {
    id: "fix",
    tab: "Fix what needs you",
    title: "See what needs you, and fix it there.",
    line: "The Overview lists what's switched on but can't work, and why. One click to the page, one pick, and its light turns green.",
    video: "/media/garrison-fix-it.mp4",
    poster: "/media/garrison-fix-it.webp",
    alt: "The Overview lists Suggestions as on but unable to work. Fix it opens Suggestions; the pointer picks #suggestions from the channel list, it saves, the warning clears, its light in the menu turns green and a toast offers Undo.",
  },
  {
    id: "saves",
    tab: "It saves itself",
    title: "Pick a level. It saves itself.",
    line: "Presets fill in the numbers, Garrison's recommendation is one click away, and every change can be undone.",
    video: "/media/garrison-saves-itself.mp4",
    poster: "/media/garrison-saves-itself.webp",
    alt: "Picking the Strict spam preset fills in 4 messages in 8 seconds and saves. Use it puts back Garrison's recommended Balanced.",
  },
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
    title: "Ask in the support server",
    text: "Questions, setup help and feature ideas: the Garrison Discord has the team and other server owners in it.",
    href: brand.supportUrl,
    link: "Join the support server",
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
  tint,
  children,
}: {
  path: string;
  className?: string;
  /** The section color of the page it shows, as the dashboard paints it. */
  tint?: "cobalt" | "orchid" | "volt" | "steel";
  children: ReactNode;
}) {
  return (
    <figure
      className={`lp-win ${className}`}
      data-tint={tint}
      aria-label={`Example: the dashboard, ${path}`}
    >
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
    <article className={`lp-feature${flip ? " lp-feature--flip" : ""}`} id={id}>
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
            <div className="lp-actions lp-hero__actions">
              {invite ? (
                <a className="lp-btn lp-btn--primary" href={invite}>
                  Add to Discord
                </a>
              ) : null}
              <Link
                className={`lp-btn ${invite ? "lp-btn--ghost" : "lp-btn--primary"}`}
                href={dashboard}
              >
                Open dashboard
              </Link>
            </div>
            <p className="lp-assure">Every module free to start · Never asks for Administrator</p>
          </div>

          {/* The focal moment: lock the server from the dashboard, and the message lands in Discord. */}
          <div className="lp-stage" id="demo">
            <AppWindow path="Security" className="lp-stage__app" tint="cobalt">
              <div className="lp-app">
                <div className="lp-app__head">
                  <h2 className="lp-app__title">Security</h2>
                </div>
                <div className="lp-app__grid">
                  {/* Two states of the same card: before the press, and the locked card it becomes. */}
                  <div className="g-card card-col gate-lockdown lp-lock">
                    <div className="card-head">
                      <h3 className="card-title">Lockdown</h3>
                      <span className="lp-lock__badge">
                        <span
                          className="g-badge g-badge--off lp-lock__badge-off"
                          aria-hidden="true"
                        >
                          Not locked
                        </span>
                        <span className="g-badge g-badge--alert lp-lock__badge-on">Active</span>
                      </span>
                    </div>
                    <div className="lp-lock__states">
                      <div className="card-col lp-lock__before" aria-hidden="true" inert>
                        <p className="g-help">
                          Locking stops @everyone talking in every channel; staff roles keep
                          talking.
                        </p>
                        <div className="lp-lock__form">
                          <span className="g-field">
                            <span>Lift automatically after</span>
                            <span className="g-input lp-fake-select">15 minutes</span>
                          </span>
                          <label className="check">
                            <input type="checkbox" defaultChecked tabIndex={-1} />
                            <span>Pause invites too</span>
                          </label>
                          <span className="g-field">
                            <span>Reason (shown in the alert)</span>
                            <span className="g-input">Raid in progress</span>
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
                        <div>
                          <div className="list-row">
                            <span className="muted">Started</span>
                            <span className="mono">9:04 PM</span>
                          </div>
                          <div className="list-row">
                            <span className="muted">Lifts</span>
                            <span className="mono">9:19 PM</span>
                          </div>
                        </div>
                        <DurationBar
                          value={0}
                          max={15}
                          label="Lockdown time served, out of its length"
                          text="Lifts in 15 min"
                          tone="alert"
                        />
                        <div>
                          <div className="list-row">
                            <span className="muted">Invites</span>
                            <span className="mono">Paused</span>
                          </div>
                          <div className="list-row">
                            <span className="muted">Reason</span>
                            <span className="mono">Raid in progress</span>
                          </div>
                        </div>
                        <span className="g-btn g-btn--primary lp-lock__lift">Lift lockdown</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-app__side">
                    <div className="g-card table-card lp-req">
                      <div className="table-card__head row-between">
                        <h3 className="card-title">Requests</h3>
                        <span className="g-help">
                          Garrison does these in Discord, usually within seconds.
                        </span>
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
                        <span className="lp-req__when">
                          mira <span className="mono">9:04 PM</span>
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
                field={["Reason", "Raid in progress"]}
                foot="Security · lockdown 3f2a9c"
              />
            </DiscordWindow>
          </div>
        </section>

        <section className="lp-section lp-watch" id="watch" aria-labelledby="lp-watch">
          <div className="lp-section__head">
            <h2 className="lp-h2" id="lp-watch">
              Watch it work
            </h2>
            <p>The dashboard's own screens and steps, up close, on a test server.</p>
          </div>
          {/* One player: pick a step, its recording shows. Radios underneath, so it works before
              scripts load; a hidden recording isn't on screen, so it neither loads nor plays. */}
          <div className="lp-watch__player">
            <fieldset className="lp-watch__steps">
              <legend className="lp-watch__legend">Pick a recording</legend>
              {WATCH.map((w, i) => (
                <label className="lp-watch__step" key={w.id}>
                  <input
                    className="lp-watch__pick"
                    type="radio"
                    name="watch"
                    value={w.id}
                    defaultChecked={i === 0}
                  />
                  <span className="lp-watch__num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="lp-watch__tab">{w.tab}</span>
                  <span className="lp-watch__more">
                    <span className="lp-watch__title">{w.title}</span>
                    <span className="lp-watch__line">{w.line}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="lp-watch__win">
              {WATCH.map((w) => (
                <div className="lp-watch__clip" data-clip={w.id} key={w.id}>
                  <DemoClip
                    src={w.video}
                    poster={w.poster}
                    width={1920}
                    height={1080}
                    label={w.title}
                    description={w.alt}
                  />
                </div>
              ))}
            </div>
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
            id="insights"
            icon="lp-icon-overview"
            title="Know what your server is doing"
            visual={
              <AppWindow path="Insights" tint="steel">
                <div className="lp-app lp-app--stack">
                  <div className="ins-bar">
                    <span className="ins-tabs">
                      <span className="ins-tab" aria-current="page">
                        Overview
                      </span>
                      <span className="ins-tab">Activity</span>
                      <span className="ins-tab">Members</span>
                    </span>
                    <span className="list-head__filters lp-hide-sm">
                      <span className="list-pill">7 days</span>
                      <span className="list-pill" aria-current="true">
                        30 days
                      </span>
                      <span className="list-pill">90 days</span>
                      <span className="list-pill">1 year</span>
                    </span>
                  </div>
                  <div className="stat-tiles lp-stats">
                    {DEMO_STATS.map((t) => (
                      <div className="g-card stat-tile" key={t.label}>
                        <span className="stat-tile__label">{t.label}</span>
                        <span className={`stat-tile__value${t.tone ? ` tone-${t.tone}` : ""}`}>
                          {t.value}
                        </span>
                        <span className="stat-tile__foot">
                          {t.delta ? (
                            <span
                              className={`stat-tile__delta ${t.delta > 0 ? "tone-go" : "tone-caution"}`}
                            >
                              {t.delta > 0 ? "▲" : "▼"} {Math.abs(t.delta)}%
                            </span>
                          ) : null}
                          <span className="g-help">{t.sub}</span>
                        </span>
                        {t.trend ? (
                          <Sparkline
                            values={t.trend}
                            label={`${t.label} over the month, from ${t.trend[0]} to ${t.trend.at(-1)}`}
                          />
                        ) : null}
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
            flip
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
            visual={
              <div className="lp-pair">
                <AppWindow path="Moderation" tint="cobalt">
                  <div className="lp-app lp-app--stack">
                    <div className="g-card card-col">
                      <div>
                        <h3 className="card-title">Escalation ladder</h3>
                        <div className="g-help">
                          Applied automatically when a member's active warnings reach a step. Undone
                          warnings don't count.
                        </div>
                      </div>
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
            flip
            visual={
              <AppWindow path="Groups and raids" tint="volt">
                <div className="lp-app lp-app--stack">
                  <article className="g-card lfg" aria-label="Example group">
                    <div className="lfg__head">
                      <div>
                        <h3 className="card-title">Mythic+ 12 · Ara-Kara</h3>
                        <div className="lfg__meta">io 2500+ · Thu, 9:30 PM</div>
                      </div>
                      <span className="g-badge g-badge--accent">1 left</span>
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
                    <div className="lfg__actions">
                      <span className="act-row">
                        <span className="g-input g-input--sm lp-fake-select">DPS</span>
                        <span className="g-btn g-btn--secondary">Join</span>
                      </span>
                    </div>
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
                        <Link
                          className={`lp-btn ${tier === "pro" ? "lp-btn--primary" : "lp-btn--ghost"} lp-btn--sm`}
                          href={`${dashboard}?upgrade=${tier}`}
                        >
                          {tier === "pro" ? "Upgrade a server" : "Get Agency"}
                        </Link>
                        <span className="lp-tier__note">
                          Sign in, pick the server, then Checkout.
                        </span>
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
          <p className="lp-price__packs">
            <strong>Need more AI?</strong> Supply packs from {formatPrice(SUPPLY_PACKS.small.price)}{" "}
            for {SUPPLY_PACKS.small.supplies.toLocaleString("en-US")} supplies, on any server, Free
            included. They're used after the month's supplies and last a year.
          </p>
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
            <a href={brand.supportUrl}>Support server</a>
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
