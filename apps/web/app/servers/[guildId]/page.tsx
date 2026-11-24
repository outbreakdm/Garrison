import { inviteUrl } from "@garrison/brand";
import {
  capacity,
  getActivity,
  getBotStatus,
  getHealthSnapshot,
  getInsights,
  getOverview,
  hasAppliedQmBuild,
  listDashboardActions,
  listQmBuilds,
  listRecentCases,
  listSignups,
  readSettings,
  setupProgress,
} from "@garrison/db";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ViewTransition } from "react";
import { WaitingForBot } from "@/components/BotOffline";
import { DurationBar, untilText } from "@/components/DurationBar";
import { ActionBadge, formatTime, plainMentions } from "@/components/format";
import { Bars } from "@/components/insights/Bars";
import { REQUEST_ERRORS } from "@/components/RequestsPanel";
import { SetupCard } from "@/components/SetupCard";
import { getDb } from "@/lib/db";
import { channelNames, guildCounts, listTextChannels } from "@/lib/discord";
import { readFlash } from "@/lib/flash";
import { moduleStates } from "@/lib/module-states";
import { ACTION_KIND } from "@/lib/rally-schema";
import { requireGuildAccess } from "@/lib/session";
import { setupHiddenCookie } from "@/lib/setup";
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

/**
 * Where a request's outcome shows, so a failure links to where it can be retried: the page,
 * and its tab or section when that isn't the first thing the page shows. A request kind
 * missing here links to the Overview's own Requests panel.
 */
const REQUEST_PAGE: Record<string, string> = {
  create_raid: "/rally?tab=raids",
  move_signup: "/rally?tab=raids",
  call_signups: "/rally?tab=raids",
  cancel_raid: "/rally?tab=raids",
  raid_signup: "/rally?tab=raids",
  raid_withdraw: "/rally?tab=raids",
  close_lfg: "/rally",
  create_lfg: "/rally",
  lfg_join: "/rally",
  lfg_leave: "/rally",
  lockdown_start: "/gatehouse#lockdown",
  lockdown_end: "/gatehouse#lockdown",
  release_quarantine: "/gatehouse#quarantine",
  post_verify_panel: "/gatehouse?tab=verification",
  verify_decide: "/gatehouse#answers",
  post_application_panel: "/applications",
  post_suggestion_panel: "/suggestions#panel",
  post_lfg_panel: "/rally?tab=panel",
  post_shop_panel: "/economy?tab=setup",
  post_stream_panel: "/beacon#post-stream-panel",
  stream_request_decide: "/beacon#stream-requests",
  application_decide: "/applications#review",
  anti_nuke: "/gatehouse?tab=antinuke",
  undo_case: "/watch",
  undo_cases: "/watch",
  ticket_bulk: "/parley",
  mod_action: "/watch",
  purge: "/watch",
  qm_plan: "/quartermaster",
  qm_chat: "/quartermaster",
  qm_apply: "/quartermaster",
  qm_cancel: "/quartermaster",
  qm_edit: "/quartermaster",
  qm_remove: "/quartermaster",
  undo_build: "/quartermaster?tab=history",
  template_save: "/quartermaster?tab=templates",
  template_apply: "/quartermaster?tab=templates",
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
  season_start: "/ranks#seasons",
  economy_adjust: "/economy",
  economy_buy: "/economy",
  economy_purchase: "/economy",
  run_health: "#health",
};

type AttentionTone = "alert" | "caution" | "waiting";

/**
 * One thing that needs someone: what's wrong (naming the thing), what that means or why, and
 * the fix as a verb, which is where the row goes. Its mark says how much it matters by shape
 * as well as color: a filled red triangle is happening now, an amber triangle (as the menu
 * marks a module) is broken until fixed, a ring only needs a look.
 */
interface Attention {
  tone: AttentionTone;
  /** "Suggestions isn't working". */
  title: string;
  /** "On, but no suggestions channel is picked." */
  detail: string;
  /** Where it's fixed, and the fix as a verb: "Pick a channel". None when the fix is in
   * Discord's own settings, which the detail then says how to do. */
  href?: string;
  action?: string;
}

/** The three groups, most urgent first, each with what it asks of you. */
const ATTENTION_GROUPS: { tone: AttentionTone; name: string; hint: string }[] = [
  { tone: "alert", name: "Happening now", hint: "Deal with these first." },
  { tone: "caution", name: "Not working", hint: "Switched on, but broken until someone fixes it." },
  {
    tone: "waiting",
    name: "When you have a minute",
    hint: "Nothing is broken; these just need a look.",
  },
];
/** "When you have a minute" shows this many before "Show N more"; the others show them all. */
const WAITING_SHOWN = 3;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A row is the link to its fix. The fix shows as a button on the right (under the sentence on
 * phones); the first row's is the panel's one white button, so the first thing to do is plain.
 */
function AttentionRow({ a, id, first }: { a: Attention; id: string; first: boolean }) {
  if (!a.href || !a.action)
    return (
      <li>
        <div className="attention__item" data-tone={a.tone}>
          <span className="attention__mark" aria-hidden="true" />
          <span className="attention__text">
            <strong>{a.title}</strong>
            <span>{a.detail}</span>
          </span>
        </div>
      </li>
    );
  return (
    <li>
      <a
        className="attention__item"
        data-tone={a.tone}
        href={a.href}
        aria-label={`${a.title}. ${a.action}`}
        aria-describedby={id}
      >
        <span className="attention__mark" aria-hidden="true" />
        <span className="attention__text">
          <strong>{a.title}</strong>
          <span id={id}>{a.detail}</span>
        </span>
        <span
          className={`g-btn g-btn--sm attention__go ${first ? "g-btn--primary" : "g-btn--secondary"}`}
          aria-hidden="true"
        >
          {a.action}
          <span className="cue" />
        </span>
      </a>
    </li>
  );
}
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
  // Set up in three clicks: until every step is done, or the card is hidden for this server.
  const setupHidden = (await cookies()).get(setupHiddenCookie(guild.id))?.value === "1";
  const [automodRow, gateRow, welcomeRow, built, textChannels, flash] = await Promise.all([
    setupHidden ? null : readSettings(db, guild.id, "automod"),
    setupHidden ? null : readSettings(db, guild.id, "gatehouse"),
    setupHidden ? null : readSettings(db, guild.id, "welcome"),
    setupHidden ? true : hasAppliedQmBuild(db, guild.id),
    setupHidden ? [] : listTextChannels(guild.id).catch(() => []),
    readFlash(),
  ]);
  const setup = setupProgress({
    automodOn: automodRow?.enabled === true,
    antiRaidOn: gateRow?.antiRaidEnabled !== false,
    welcomeOn: welcomeRow?.joinEnabled === true,
    built,
  });
  const showSetup = !setupHidden && !Object.values(setup).every(Boolean);

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
  // Off modules worth turning on, safety first; at most three, each with why. Its band's tiles
  // share one height, so a fourth would stretch Security, raids and groups with it.
  const offByName = new Map(mods.filter((m) => m.state === "off").map((m) => [m.name, m]));
  const worth = WORTH.filter((w) => offByName.has(w.name)).slice(0, 3);
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
  const requestHref = (kind: string) => {
    const page = REQUEST_PAGE[kind];
    return page ? `${base}${page}` : "#requests";
  };

  // What needs someone (sorted most urgent first below). Nothing shows when nothing does.
  const attention: Attention[] = [];
  const lock = o.activeLockdown;
  if (lock)
    attention.push({
      tone: "alert",
      title: `The server is locked down${lock.source === "anti_raid" ? " by anti-raid" : ""}`,
      detail: `Members can't post; staff roles still can. ${
        lock.endsAt
          ? `It lifts by itself ${untilText(lock.endsAt.getTime() - now)}.`
          : "It stays until someone lifts it."
      }`,
      href: `${base}/gatehouse#lockdown`,
      action: "Review the lockdown",
    });
  if (o.quarantines24h > 0)
    attention.push({
      tone: "alert",
      title: `Anti-nuke quarantined ${plural(o.quarantines24h, "member", "members")}`,
      detail: "Their roles were removed and saved. Give them back if it was a mistake.",
      href: `${base}/gatehouse#quarantine`,
      action: "Review quarantine",
    });
  // Each problem the health check found is its own row with its own fix: broken is Not working,
  // a gap (no log channel) is for when you have a minute. Protections switched off are a choice,
  // not a fault: they stay in the check's own list, and "Worth turning on" offers them. A missing
  // permission that a module's own row already reports isn't said twice.
  const failing = health?.checks.filter((c) => c.status !== "ok") ?? [];
  const blockedNames = new Set(mods.filter((m) => m.state === "blocked").map((m) => m.name));
  const checkHref = (to: string | undefined) =>
    to === "permissions" ? fixUrl : to?.startsWith("/") ? `${base}${to}` : null;
  for (const c of failing) {
    if (c.key === "anti-raid-off" || c.key === "anti-nuke-off") continue;
    if (c.key?.startsWith("perm:") && blockedNames.has(c.key.slice(5))) continue;
    // Written before checks said where they're fixed (2026-11-23): only the broken ones show
    // here until the next check, which Run again starts.
    if (!c.key && c.status === "warn") continue;
    const href = checkHref(c.fix?.to);
    attention.push({
      tone: c.status === "fix" ? "caution" : "waiting",
      title: c.title ?? "The health check found a problem",
      detail: plainMentions(c.text),
      href: href ?? undefined,
      action: href ? c.fix?.action : undefined,
    });
  }
  // The health check's own run: asked for and not done yet, or turned down.
  const healthRun = actions.find((a) => a.kind === "run_health");
  const checking =
    (healthRun?.status === "pending" || healthRun?.status === "running") &&
    now - healthRun.createdAt.getTime() < 10 * 60_000;
  const runError =
    typeof query.error === "string"
      ? REQUEST_ERRORS[query.error]
      : healthRun?.status === "failed" && now - healthRun.createdAt.getTime() < 3_600_000
        ? (healthRun.message ?? "The health check didn't run.")
        : undefined;
  const planWaiting = build?.status === "pending";
  if (planWaiting && build)
    attention.push({
      tone: "waiting",
      title: "An AI assistant draft is waiting for review",
      detail: `Drafted ${ago(build.createdAt)}. Nothing changes in Discord until someone applies it, and it waits as long as you need.`,
      href: `${base}/quartermaster#qm-plan`,
      action: "Review the draft",
    });
  const untilRaid = o.nextOp ? o.nextOp.startsAt.getTime() - now : null;
  if (o.nextOp && untilRaid !== null && untilRaid > 0 && untilRaid < 3 * 86_400_000) {
    const short = o.nextOp.slots
      .map((s) => ({ name: s.name, n: s.count - seated.filter((x) => x.role === s.name).length }))
      .filter((s) => s.n > 0);
    if (short.length)
      attention.push({
        tone: "waiting",
        title: `${o.nextOp.title} is ${plural(
          short.reduce((t, s) => t + s.n, 0),
          "person",
          "people",
        )} short`,
        detail: `${formatTime(o.nextOp.startsAt, o.nextOp.timezone)}. Still needs ${short
          .map((s) => `${s.n} ${s.name}`)
          .join(", ")}.`,
        href: `${base}/rally?tab=raids`,
        action: "See signups",
      });
  }
  for (const m of mods.filter((x) => x.state === "blocked"))
    attention.push({
      tone: "caution",
      title: `${m.name} isn't working`,
      detail: m.reason ?? "Something it needs is missing.",
      // Straight to the field or permission that fixes it, in the page's own words.
      href:
        m.fix?.to === "permissions"
          ? (fixUrl ?? `${base}${m.href}`)
          : `${base}${m.href}${m.fix?.to ?? ""}`,
      action: m.fix?.action ?? `Open ${m.name}`,
    });
  const stuck = actions.filter(
    (a) =>
      (a.status === "pending" || a.status === "running") &&
      now - a.createdAt.getTime() > 10 * 60_000,
  );
  if (stuck[0])
    attention.push({
      tone: "waiting",
      title: live
        ? `${plural(stuck.length, "request is", "requests are")} taking a while`
        : `${plural(stuck.length, "request is", "requests are")} waiting for Garrison`,
      detail: live
        ? `${ACTION_KIND[stuck[0].kind] ?? "A request"}, asked ${ago(stuck[0].createdAt)}. Garrison runs them in order and may be busy.`
        : `${lastBeat ? `Garrison was last seen ${ago(new Date(lastBeat))}` : "Garrison hasn't checked in yet"}. Requests run as soon as it's back.`,
      href: live ? requestHref(stuck[0].kind) : "/status",
      action: live ? "See the request" : "Check Garrison's status",
    });
  const failed = actions.filter(
    (a) => a.status === "failed" && now - a.createdAt.getTime() < 86_400_000,
  );
  if (failed[0])
    attention.push({
      tone: "caution",
      title: `${plural(failed.length, "request", "requests")} failed in the last day`,
      detail: `${ACTION_KIND[failed[0].kind] ?? failed[0].kind}: ${failed[0].message ?? "no reason given"}`,
      href: requestHref(failed[0].kind),
      action: "See what failed",
    });

  // Grouped most urgent first; the first row of the first group is the one thing to do first.
  const groups = ATTENTION_GROUPS.map((g) => ({
    ...g,
    items: attention.filter((a) => a.tone === g.tone),
  })).filter((g) => g.items.length);
  const worst = groups[0]?.tone ?? null;

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
          {/* The last build that says something: waiting, built, or not built. A discarded,
              replaced or (from before drafts stopped expiring) expired one is left out. */}
          {build && !["cancelled", "expired", "discarded"].includes(build.status) ? (
            <span className="ov-hero__build">
              AI assistant v{build.version} · {ago(build.createdAt)} ·{" "}
              {build.status === "pending"
                ? "waiting for review"
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

      {flash?.ok ? (
        <div className="notice notice--ok" role="status">
          {flash.ok}
        </div>
      ) : null}
      {flash?.error ? (
        <div className="notice" role="alert">
          {flash.error}
        </div>
      ) : null}

      {/* Band 1: what needs you, grouped by how much, each with its fix; or one line saying
          nothing does. The health check is the panel's foot. */}
      <section
        className={worst ? "g-card attention" : "g-card attention attention--clear"}
        id="attention"
        data-worst={worst ?? undefined}
        aria-labelledby="attention-title"
      >
        <div className="attention__head">
          <span className="attention__tile">
            {worst ? (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path
                  d="M8 2.2 14.2 13H1.8z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path d="M8 6.4v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="11.2" r=".85" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
                <path
                  d="m3.5 8.5 3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <h2 className="card-title" id="attention-title">
            {worst ? (
              <>
                Needs attention <span className="count">{attention.length}</span>
              </>
            ) : (
              "All clear"
            )}
          </h2>
          {worst ? null : (
            <span className="attention__sum">Every module that's on is working.</span>
          )}
        </div>
        {groups.map((g, gi) => {
          const shownHere = g.tone === "waiting" ? WAITING_SHOWN : g.items.length;
          const row = (a: Attention, i: number) => (
            <AttentionRow
              a={a}
              id={`attn-${g.tone}-${i}`}
              first={gi === 0 && i === 0}
              key={a.title}
            />
          );
          return (
            <section
              className="attention__group"
              data-tone={g.tone}
              aria-labelledby={`attn-${g.tone}`}
              key={g.tone}
            >
              <h3 className="attention__group-head" id={`attn-${g.tone}`}>
                <span className="attention__group-name">{g.name}</span>
                <span className="count">{g.items.length}</span>
                <span className="attention__hint">{g.hint}</span>
              </h3>
              <ul className="attention__list">{g.items.slice(0, shownHere).map(row)}</ul>
              {g.items.length > shownHere ? (
                <details className="attention__more">
                  <summary>
                    <span className="attention__more-show">
                      Show {g.items.length - shownHere} more
                    </span>
                    <span className="attention__more-hide">Show fewer</span>
                    <span className="cue" aria-hidden="true" />
                  </summary>
                  <ul className="attention__list">
                    {g.items.slice(shownHere).map((a, i) => row(a, i + shownHere))}
                  </ul>
                </details>
              ) : null}
            </section>
          );
        })}
        <div className="attention__foot" id="health">
          {health ? (
            <details className="attention__checks">
              <summary>
                Health check
                <span className="attention__checks-when">
                  {plural(health.checks.length, "check", "checks")}, {ago(health.computedAt)} ·{" "}
                  {failing.length ? `${failing.length} to look at` : "all OK"}
                </span>
                <span className="cue" aria-hidden="true" />
              </summary>
              <ul className="health-list">
                {health.checks.map((c) => {
                  const href = c.status === "ok" ? null : checkHref(c.fix?.to);
                  return (
                    <li className="health-row" key={c.key ?? c.text}>
                      <span
                        className={`g-badge ${c.status === "ok" ? "g-badge--go" : c.status === "fix" ? "g-badge--alert" : "g-badge--caution"}`}
                      >
                        {c.status === "ok" ? "OK" : c.status === "fix" ? "Fix" : "Check"}
                      </span>
                      <span>
                        {c.title ? <strong>{c.title}. </strong> : null}
                        {plainMentions(c.text)}
                        {href && c.fix ? (
                          <>
                            {" "}
                            <a href={href}>{c.fix.action}</a>
                          </>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : (
            <span className="attention__checks-none">
              No health check yet: it checks Garrison's permissions, role and channels.
            </span>
          )}
          {checking ? (
            <span className="attention__checking" role="status">
              <span className="attention__spin" aria-hidden="true" />
              Checking now
            </span>
          ) : (
            <form action={requestAction} className="attention__run">
              <input type="hidden" name="guildId" value={guild.id} />
              <input type="hidden" name="page" value="" />
              <input type="hidden" name="kind" value="run_health" />
              <button type="submit" className="g-btn g-btn--ghost g-btn--sm">
                {health ? "Run again" : "Run a check"}
              </button>
            </form>
          )}
          {checking ? (
            <div className="attention__wait">
              <WaitingForBot />
            </div>
          ) : null}
          {runError ? (
            <p className="attention__run-error" role="alert">
              {runError}
            </p>
          ) : null}
        </div>
      </section>

      {showSetup ? (
        <SetupCard
          guildId={guild.id}
          done={setup}
          channels={textChannels.map((c) => ({ id: c.id, name: c.name }))}
        />
      ) : build ? null : (
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
          <div className="g-help">LFG posts players can join right now.</div>
        </section>
      </div>
    </>
  );
}
