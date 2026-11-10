import type { LfgSlotGroup, SetupFacts } from "@garrison/db";
import { ACTION_KIND } from "./rally-schema";

/**
 * The overview's "Needs attention" list and setup checklist, worked out from
 * what the page already read. Pure, so it's unit tested. Every link is a path
 * under /servers/:id ("" is the overview itself) and points at the page and
 * panel that fixes it.
 */

/** Raids starting this soon that are short of players are worth a look. */
export const SHORT_RAID_WINDOW_MS = 48 * 3_600_000;
/** Failed requests stay listed this long, unless the same kind worked since. */
export const FAILED_WINDOW_MS = 24 * 3_600_000;
/** Quartermaster plans wait this long to be built, as the bot enforces. */
export const PLAN_TTL_MS = 15 * 60_000;
/** At most this many raids or failed requests each, so the list stays short. */
const MAX_EACH = 3;

export interface AttentionItem {
  key: string;
  tone: "alert" | "caution";
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export interface AttentionInput {
  now: Date;
  lockdown: { source: "manual" | "anti_raid"; startedAt: Date; endsAt: Date | null } | null;
  /** Open quarantines. Kicked bots are listed too, but there is nothing to restore for them. */
  quarantines: { userTag: string; kicked: boolean }[];
  /** The latest Quartermaster build, if any. */
  build: { version: number; status: string; createdAt: Date; requestedByTag: string } | null;
  /** Scheduled raids, each with who is seated (not benched). */
  raids: {
    id: string;
    title: string;
    startsAt: Date;
    slots: LfgSlotGroup[];
    seated: { role: string }[];
  }[];
  /** Recent dashboard requests, newest first. */
  actions: {
    kind: string;
    status: string;
    message: string | null;
    createdAt: Date;
    payload: unknown;
  }[];
  health: { checks: { status: "ok" | "warn" | "fix"; text: string }[] } | null;
}

/** "5 min", "3 h", "2 d". */
export function span(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Where each kind of request is made, so a failure links back to it. */
export function requestPage(kind: string, payload: unknown) {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (kind) {
    case "mod_action":
      return typeof p.userId === "string" && /^\d{17,20}$/.test(p.userId)
        ? `watch/member/${p.userId}`
        : "watch";
    case "undo_case":
    case "purge":
      return "watch";
    case "lockdown_start":
    case "lockdown_end":
      return "gatehouse#lockdown";
    case "release_quarantine":
      return "gatehouse#quarantines";
    case "post_verify_panel":
      return "gatehouse#verification";
    case "anti_nuke":
      return "gatehouse#anti-nuke";
    case "qm_plan":
    case "qm_apply":
    case "qm_cancel":
    case "undo_build":
      return "quartermaster";
    case "run_health":
      return "#health";
    default:
      return "rally";
  }
}

export function needsAttention(input: AttentionInput): AttentionItem[] {
  const now = input.now.getTime();
  const items: AttentionItem[] = [];

  const l = input.lockdown;
  if (l)
    items.push({
      key: "lockdown",
      tone: "alert",
      title: "The server is locked down",
      detail: `${l.source === "anti_raid" ? "Anti-raid locked it" : "Locked"} ${span(now - l.startedAt.getTime())} ago. ${
        l.endsAt
          ? `It lifts by itself in ${span(l.endsAt.getTime() - now)}.`
          : "It stays locked until someone lifts it."
      }`,
      href: "gatehouse#lockdown",
      cta: "Review lockdown",
    });

  const held = input.quarantines.filter((q) => !q.kicked);
  if (held.length)
    items.push({
      key: "quarantine",
      tone: "alert",
      title: `${held.length} ${plural(held.length, "member is", "members are")} quarantined by anti-nuke`,
      detail:
        held.length === 1
          ? `${held[0]?.userTag} lost their roles. Restore them if it was a false alarm.`
          : "They lost their roles. Restore them if it was a false alarm.",
      href: "gatehouse#quarantines",
      cta: "Review",
    });

  const failing = (input.health?.checks ?? []).filter((c) => c.status !== "ok");
  if (failing.length)
    items.push({
      key: "health",
      tone: failing.some((c) => c.status === "fix") ? "alert" : "caution",
      title: `${failing.length} health ${plural(failing.length, "check needs", "checks need")} a look`,
      detail: failing[0]?.text ?? "",
      href: "#health",
      cta: "See checks",
    });

  const b = input.build;
  if (b?.status === "failed")
    items.push({
      key: "build",
      tone: "alert",
      title: `Build v${b.version} stopped partway`,
      detail: "Some of it was built. Check what was made, or undo it.",
      href: "quartermaster",
      cta: "Review build",
    });
  else if (b?.status === "pending" && now - b.createdAt.getTime() < PLAN_TTL_MS)
    items.push({
      key: "plan",
      tone: "caution",
      title: `Quartermaster plan v${b.version} is waiting`,
      detail: `Asked by ${b.requestedByTag}. Nothing is built until it's applied, and it expires in ${span(
        b.createdAt.getTime() + PLAN_TTL_MS - now,
      )}.`,
      href: "quartermaster#plan",
      cta: "Review plan",
    });

  const soon = input.raids
    .filter((r) => {
      const t = r.startsAt.getTime();
      return t > now && t - now <= SHORT_RAID_WINDOW_MS;
    })
    .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  for (const r of soon) {
    const short = r.slots
      .map((g) => ({ name: g.name, n: g.count - r.seated.filter((s) => s.role === g.name).length }))
      .filter((g) => g.n > 0);
    if (!short.length) continue;
    const total = short.reduce((sum, g) => sum + g.n, 0);
    items.push({
      key: `raid-${r.id}`,
      tone: "caution",
      title: `${r.title} is ${total} short`,
      detail: `Starts in ${span(r.startsAt.getTime() - now)}. Needs ${short
        .map((g) => (g.name ? `${g.n} ${g.name}` : `${g.n} more`))
        .join(", ")}.`,
      href: `rally#raid-${r.id}`,
      cta: "Open raid",
    });
    if (items.filter((i) => i.key.startsWith("raid-")).length >= MAX_EACH) break;
  }

  // A failure stops mattering once the same kind of request has worked since.
  const failed = input.actions.filter(
    (a, i) =>
      a.status === "failed" &&
      now - a.createdAt.getTime() <= FAILED_WINDOW_MS &&
      !input.actions.slice(0, i).some((later) => later.kind === a.kind && later.status === "done"),
  );
  for (const [i, a] of failed.slice(0, MAX_EACH).entries())
    items.push({
      key: `failed-${i}`,
      tone: "caution",
      title: `${ACTION_KIND[a.kind] ?? "A request"} failed ${span(now - a.createdAt.getTime())} ago`,
      detail: a.message ?? "Garrison couldn't do it.",
      href: requestPage(a.kind, a.payload),
      cta: "Open",
    });

  // Alerts first; otherwise keep the order above.
  return [...items.filter((i) => i.tone === "alert"), ...items.filter((i) => i.tone !== "alert")];
}

export interface SetupStep {
  key: string;
  done: boolean;
  title: string;
  detail: string;
  /** Shown instead of `detail` once the step is done. */
  doneDetail?: string;
  href: string;
  cta: string;
}

/** The first things a new server should set up, each done or not from what's stored. */
export function setupSteps(f: SetupFacts): SetupStep[] {
  return [
    {
      key: "log",
      done: Boolean(f.logChannelId),
      title: "Pick a log channel",
      detail: "Every warning, timeout, kick and ban gets a line there.",
      href: "watch?edit=settings#settings",
      cta: "Pick a channel",
    },
    {
      key: "verify",
      done: Boolean(f.verifyRoleId),
      title: "Turn on verification",
      detail: "Newcomers press a button to get a role, so bots that join can't post right away.",
      href: "gatehouse?edit=verification#verification",
      cta: "Set it up",
    },
    {
      key: "antiraid",
      done: f.antiRaidEnabled && Boolean(f.alertChannelId ?? f.logChannelId),
      title: "Give anti-raid somewhere to post",
      detail: f.antiRaidEnabled
        ? "It's on, but its alerts need a channel. The log channel works too."
        : "Anti-raid is off. Turn it on and pick a channel for its alerts.",
      href: "gatehouse?edit=anti-raid#anti-raid",
      cta: "Review",
    },
    {
      key: "ranks",
      done: f.ranksDecided,
      title: "Decide on Ranks",
      detail: "Members earn XP for chatting and level up. Turn it on, or save it off.",
      doneDetail: `Ranks is ${f.ranksEnabled ? "on" : "off"}.`,
      href: "ranks?edit=settings#settings",
      cta: "Decide",
    },
    {
      key: "rally",
      done: f.rallyUsed,
      title: "Plan a raid or post a group",
      detail: "Raids get a signup card in Discord. LFG templates make a group one click.",
      href: "rally?create=1#create-raid",
      cta: "Create a raid",
    },
  ];
}

/** Show the checklist until every step is done or someone hides it. */
export const showSetup = (f: SetupFacts, steps = setupSteps(f)) =>
  !f.setupDismissed && steps.some((s) => !s.done);
