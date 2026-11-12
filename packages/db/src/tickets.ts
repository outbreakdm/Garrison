/**
 * Tickets (module "Parley"): a panel card in Discord with one button per topic.
 * Pressing one opens a private channel for that member and the server's staff.
 * Pure and shared, so the dashboard and the bot check setups with exactly the
 * same rules. Browser-safe (`@garrison/db/cards`).
 *
 * Free: 1 panel, 3 topics, claim and close, transcripts kept 30 days.
 * Pro: 10 panels, 10 topics each, questions before a ticket opens, auto-assign,
 * transcripts kept 365 days, ticket stats, and the card's Pro look. Over a limit
 * after a downgrade, the extra panels and topics pause; nothing is deleted.
 */

import { blankCard, type CustomCard, lockedCardFields, parseCard } from "./cards";
import { isEmoji, newCustomEmoji } from "./emoji";
import type { Entitlements } from "./plans";
import { FEATURES } from "./plans";
import type { Parsed } from "./rally";

export interface TicketTopic {
  /** Stable ID, in the button's custom ID, so posted panels keep working after edits. */
  id: string;
  /** The button label and the ticket's topic. */
  label: string;
  emoji: string | null;
  /** Pro: asked in a form before the ticket opens. Up to 5. */
  questions: string[];
}

export interface TicketPanel {
  id: string;
  /** What the dashboard calls it. Members never see it. */
  name: string;
  card: CustomCard;
  topics: TicketTopic[];
}

export interface TicketConfig {
  panels: TicketPanel[];
  /** Roles that see and answer every ticket. */
  staffRoleIds: string[];
  /** The Discord category ticket channels open under. Null: the top of the channel list. */
  parentId: string | null;
  /** Where a summary goes when a ticket closes. Null: dashboard only. */
  logChannelId: string | null;
  /** Open tickets one member can have at once. */
  maxOpen: number;
  /** Ping the staff roles when a ticket opens. */
  pingStaff: boolean;
  /** Pro: hand each new ticket to the staff member with the fewest open ones. */
  autoAssign: boolean;
}

export const TICKET_LIMITS = {
  name: 40,
  label: 80,
  question: 45,
  questions: 5,
  answer: 1000,
  staffRoles: 10,
  maxOpen: 5,
  reason: 300,
  note: 2000,
} as const;

export const PANEL_HARD_MAX = FEATURES["tickets.panels"].pro;
export const TOPIC_HARD_MAX = FEATURES["tickets.topics"].pro;

export const DEFAULT_TICKETS: TicketConfig = {
  panels: [],
  staffRoleIds: [],
  parentId: null,
  logChannelId: null,
  maxOpen: 1,
  pingStaff: true,
  autoAssign: false,
};

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export const panelLimit = (ent: Entitlements) => ent["tickets.panels"];
export const topicLimit = (ent: Entitlements) => ent["tickets.topics"];
export const isPanelPaused = (index: number, ent: Entitlements) => index >= panelLimit(ent);
export const isTopicPaused = (index: number, ent: Entitlements) => index >= topicLimit(ent);
/** How long a closed ticket's transcript is kept, in days, on this plan. */
export const historyDays = (ent: Entitlements) => ent["tickets.historyDays"];

/** Starting points for a new panel. Every word can be changed after. */
export const TICKET_PANEL_PRESETS: Record<
  string,
  { name: string; card: CustomCard; topics: string[] }
> = {
  support: {
    name: "Support",
    topics: ["Get help", "Report a member", "Appeal"],
    card: {
      ...blankCard("Need a hand?"),
      blocks: [
        {
          kind: "text",
          text: "Pick what it's about and a private channel opens for you and the staff. Only you and the staff can see it.",
        },
      ],
    },
  },
  apply: {
    name: "Applications",
    topics: ["Apply to join"],
    card: {
      ...blankCard("Join the team"),
      blocks: [
        {
          kind: "text",
          text: "Press the button to start your application. A recruiter will read it in a private channel.",
        },
      ],
    },
  },
  blank: { name: "Ticket panel", topics: ["Open a ticket"], card: blankCard("Open a ticket") },
};

function parseTopic(raw: unknown, where: string): Parsed<TicketTopic> {
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id))
    return { ok: false, error: `${where} has no valid ID.` };
  const label = line(r.label);
  if (!label) return { ok: false, error: `${where} needs a label.` };
  if (label.length > TICKET_LIMITS.label)
    return { ok: false, error: `Topic labels can be ${TICKET_LIMITS.label} characters at most.` };
  const emoji = line(r.emoji) || null;
  if (emoji && !isEmoji(emoji))
    return {
      ok: false,
      error: `${label}: the emoji must be one emoji, like 🎫, or one of this server's emoji.`,
    };
  const rawQuestions = Array.isArray(r.questions) ? r.questions : [];
  const questions = rawQuestions.map(line).filter(Boolean);
  if (questions.length > TICKET_LIMITS.questions)
    return { ok: false, error: `${label}: a form can ask ${TICKET_LIMITS.questions} questions.` };
  if (questions.some((q) => q.length > TICKET_LIMITS.question))
    return {
      ok: false,
      error: `${label}: questions can be ${TICKET_LIMITS.question} characters (Discord's limit for a form label).`,
    };
  return { ok: true, value: { id: r.id, label, emoji, questions } };
}

/** Check one panel's shape. Plan rules are in `checkTicketPanels`. */
export function parseTicketPanel(raw: unknown, index = 0): Parsed<TicketPanel> {
  const where = `Panel ${index + 1}`;
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id))
    return { ok: false, error: `${where} has no valid ID.` };
  const name = line(r.name);
  if (!name) return { ok: false, error: `${where} needs a name.` };
  if (name.length > TICKET_LIMITS.name)
    return { ok: false, error: `Panel names can be ${TICKET_LIMITS.name} characters at most.` };
  const card = parseCard(r.card, name);
  if (!card.ok) return card;
  if (!Array.isArray(r.topics)) return { ok: false, error: `${where} isn't valid.` };
  if (r.topics.length > TOPIC_HARD_MAX)
    return { ok: false, error: `${name}: a panel can have ${TOPIC_HARD_MAX} topics at most.` };
  const topics: TicketTopic[] = [];
  for (const [i, t] of r.topics.entries()) {
    const topic = parseTopic(t, `${name}, topic ${i + 1}`);
    if (!topic.ok) return topic;
    if (topics.some((x) => x.id === topic.value.id))
      return { ok: false, error: `${name}: two topics share an ID. Refresh and try again.` };
    topics.push(topic.value);
  }
  return { ok: true, value: { id: r.id, name, card: card.value, topics } };
}

/** Pro rules one panel breaks on this plan. `before` is the same panel as saved. */
export function panelPlanProblems(
  panel: TicketPanel,
  ent: Entitlements,
  before?: TicketPanel | null,
): string[] {
  const out = lockedCardFields(panel.card, ent, before?.card).map(
    (f) => `${f.label} is part of Garrison Pro.`,
  );
  if (
    !ent["emoji.custom"] &&
    newCustomEmoji(
      panel.topics.map((t) => t.emoji),
      (before?.topics ?? []).map((t) => t.emoji),
    ).length
  )
    out.push("Server emoji are part of Garrison Pro.");
  const limit = topicLimit(ent);
  if (panel.topics.length > limit && panel.topics.length > (before?.topics.length ?? 0))
    out.push(`Free panels have ${limit} topics. Garrison Pro allows ${TOPIC_HARD_MAX}.`);
  if (!ent["tickets.forms"]) {
    const changed = panel.topics.some((t) => {
      const was = before?.topics.find((b) => b.id === t.id);
      return (
        t.questions.length > 0 &&
        JSON.stringify(t.questions) !== JSON.stringify(was?.questions ?? [])
      );
    });
    if (changed) out.push("Questions before a ticket opens are part of Garrison Pro.");
  }
  return out;
}

/**
 * Check a server's whole panel list against its plan. `before` is the list as
 * saved: values already saved are let through, so a server back on Free keeps
 * editing what it has (extra panels and topics pause, nothing is lost).
 */
export function checkTicketPanels(
  raw: unknown,
  ent: Entitlements,
  before: TicketPanel[] = [],
): Parsed<TicketPanel[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Panels must be a list." };
  const limit = panelLimit(ent);
  if (raw.length > PANEL_HARD_MAX)
    return { ok: false, error: `A server can have ${PANEL_HARD_MAX} ticket panels at most.` };
  if (raw.length > limit && raw.length > before.length)
    return {
      ok: false,
      error: `Free servers can have ${limit} ticket panel. Garrison Pro allows ${PANEL_HARD_MAX}.`,
    };
  const out: TicketPanel[] = [];
  for (const [i, p] of raw.entries()) {
    const panel = parseTicketPanel(p, i);
    if (!panel.ok) return panel;
    if (out.some((x) => x.id === panel.value.id))
      return { ok: false, error: "Two panels share an ID. Refresh and try again." };
    const problems = panelPlanProblems(
      panel.value,
      ent,
      before.find((b) => b.id === panel.value.id),
    );
    if (problems[0]) return { ok: false, error: `${panel.value.name}: ${problems[0]}` };
    out.push(panel.value);
  }
  return { ok: true, value: out };
}

/** Stored panels, read leniently: anything that no longer parses is skipped. */
export function readTicketPanels(raw: unknown): TicketPanel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p, i) => {
    const panel = parseTicketPanel(p, i);
    return panel.ok ? [panel.value] : [];
  });
}

/** A stored setup row, read leniently, with defaults for anything missing or broken. */
export function readTicketConfig(
  raw: Partial<Record<keyof TicketConfig, unknown>> | null,
): TicketConfig {
  if (!raw) return { ...DEFAULT_TICKETS };
  const id = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  const maxOpen = Number(raw.maxOpen);
  return {
    panels: readTicketPanels(raw.panels),
    staffRoleIds: Array.isArray(raw.staffRoleIds)
      ? raw.staffRoleIds.filter((v): v is string => typeof v === "string" && SNOWFLAKE.test(v))
      : [],
    parentId: id(raw.parentId),
    logChannelId: id(raw.logChannelId),
    maxOpen:
      Number.isInteger(maxOpen) && maxOpen >= 1 && maxOpen <= TICKET_LIMITS.maxOpen ? maxOpen : 1,
    pingStaff: raw.pingStaff !== false,
    autoAssign: raw.autoAssign === true,
  };
}

/** Check who handles tickets and where they go. `before` is what's saved. */
export function checkTicketOptions(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: Pick<TicketConfig, "autoAssign">,
): Parsed<Omit<TicketConfig, "panels">> {
  const staffRoleIds = Array.isArray(raw.staffRoleIds)
    ? [...new Set(raw.staffRoleIds.map(String))]
    : [];
  if (!staffRoleIds.every((id) => SNOWFLAKE.test(id)))
    return { ok: false, error: "Pick staff roles from this server's list." };
  if (staffRoleIds.length > TICKET_LIMITS.staffRoles)
    return { ok: false, error: `Pick up to ${TICKET_LIMITS.staffRoles} staff roles.` };
  const snowflakeOrNull = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  const parentId = snowflakeOrNull(raw.parentId);
  const logChannelId = snowflakeOrNull(raw.logChannelId);
  if ((raw.parentId && !parentId) || (raw.logChannelId && !logChannelId))
    return { ok: false, error: "Pick channels from this server's list." };
  const maxOpen = Number(raw.maxOpen);
  if (!Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > TICKET_LIMITS.maxOpen)
    return { ok: false, error: `Open tickets per member go from 1 to ${TICKET_LIMITS.maxOpen}.` };
  const autoAssign = raw.autoAssign === true;
  if (autoAssign && !ent["tickets.autoAssign"] && !before.autoAssign)
    return { ok: false, error: "Auto-assign is part of Garrison Pro." };
  return {
    ok: true,
    value: {
      staffRoleIds,
      parentId,
      logChannelId,
      maxOpen,
      pingStaff: raw.pingStaff === true,
      autoAssign,
    },
  };
}

/** Questions a topic asks on this plan: none while forms are paused. */
export const activeQuestions = (topic: TicketTopic, ent: Entitlements) =>
  ent["tickets.forms"] ? topic.questions : [];

export type TicketView = "staff" | "member" | "unclaimed" | "closed" | "all";

/** Who a ticket waits on. A ticket nobody has written in yet waits on staff. */
export function waitingOn(t: { status: "open" | "closed"; lastFrom: string | null }) {
  if (t.status === "closed") return "closed" as const;
  return t.lastFrom === "staff" ? ("member" as const) : ("staff" as const);
}

/** Ticket channel names: ticket-0042. */
export const ticketChannelName = (n: number) => `ticket-${String(n).padStart(4, "0")}`;

/** When a ticket closed now on this plan is removed, transcript and all. */
export function expiresAt(ent: Entitlements, closedAt: Date) {
  return new Date(closedAt.getTime() + historyDays(ent) * 86_400_000);
}
