/**
 * Message builder (module "Dispatch"): cards designed on the dashboard, posted
 * now or on a schedule. Pure and browser-safe, so the dashboard and the bot use
 * the same rules and work out the same send times.
 *
 * Free: any number of saved messages (up to 50), 3 of them scheduled, once each.
 * Pro: 50 scheduled, repeating daily or weekly, link buttons, the card's Pro look.
 * Times are wall-clock times in the server's time zone (Settings), so a weekly
 * message keeps its hour across daylight-saving changes.
 */

import { blankCard, type CustomCard, lockedCardFields, parseCard } from "./cards";
import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";
import { addDaysInZone, zonedToUtc } from "./time";

export interface LinkButton {
  label: string;
  url: string;
}

export type Repeat = "none" | "daily" | "weekly";

export interface Schedule {
  /** Local wall time in the server's time zone, "YYYY-MM-DDTHH:mm". */
  at: string;
  repeat: Repeat;
}

export interface SavedMessage {
  id: string;
  /** What the dashboard calls it. */
  name: string;
  card: CustomCard;
  /** Pro: up to 5 link buttons under the card. */
  buttons: LinkButton[];
  channelId: string | null;
  schedule: Schedule | null;
}

export const MESSAGE_LIMITS = { name: 40, buttons: 5, label: 80, url: 512, saved: 50 } as const;
export const SCHEDULED_HARD_MAX = FEATURES["messages.scheduled"].pro;
/** A send missed by more than this (the bot was offline) is skipped, not sent late. */
export const MISSED_AFTER_MS = 60 * 60_000;

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export const MESSAGE_PRESETS: Record<string, { name: string; card: CustomCard }> = {
  announcement: {
    name: "Announcement",
    card: {
      ...blankCard("Big news"),
      blocks: [{ kind: "text", text: "Say what's happening, when, and what people should do." }],
    },
  },
  rules: {
    name: "Rules",
    card: {
      ...blankCard("Server rules"),
      blocks: [
        { kind: "text", text: "1. Be kind.\n2. No spam or self-promotion.\n3. Keep it on topic." },
        { kind: "divider" },
        { kind: "text", text: "-# Breaking a rule gets a warning first." },
      ],
    },
  },
  reminder: {
    name: "Weekly reminder",
    card: {
      ...blankCard("Raid night tonight"),
      blocks: [{ kind: "text", text: "Sign up in the raid channel before 7 PM." }],
    },
  },
  blank: { name: "Message", card: blankCard("New message") },
};

/** The instant a wall time happens in `tz`. Null when it isn't a real date and time. */
export function wallToUtc(at: string, tz: string): Date | null {
  const m = WALL.exec(at);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return zonedToUtc({ year, month, day, hour, minute }, tz);
}

/**
 * The send this schedule owes now, if any: the latest occurrence at or before
 * `now`, unless it was already sent (`last`) or was missed by more than an hour.
 */
export function dueOccurrence(
  schedule: Schedule,
  tz: string,
  last: Date | null,
  now = new Date(),
): Date | null {
  const first = wallToUtc(schedule.at, tz);
  if (!first || first > now) return null;
  let occ = first;
  if (schedule.repeat !== "none") {
    const step = schedule.repeat === "daily" ? 1 : 7;
    // Jump close, then walk: day lengths vary across daylight-saving changes.
    const skip = Math.max(
      0,
      Math.floor((now.getTime() - first.getTime()) / (step * 86_400_000)) - 1,
    );
    occ = addDaysInZone(first, skip * step, tz);
    for (let next = addDaysInZone(occ, step, tz); next <= now; next = addDaysInZone(occ, step, tz))
      occ = next;
  }
  if (last && last >= occ) return null;
  if (now.getTime() - occ.getTime() > MISSED_AFTER_MS) return null;
  return occ;
}

/** The next send after `now`, for the dashboard. Null when nothing is coming. */
export function nextOccurrence(schedule: Schedule, tz: string, now = new Date()): Date | null {
  const first = wallToUtc(schedule.at, tz);
  if (!first) return null;
  if (first > now) return first;
  if (schedule.repeat === "none") return null;
  const step = schedule.repeat === "daily" ? 1 : 7;
  let occ = first;
  const skip = Math.max(0, Math.floor((now.getTime() - first.getTime()) / (step * 86_400_000)) - 1);
  occ = addDaysInZone(first, skip * step, tz);
  while (occ <= now) occ = addDaysInZone(occ, step, tz);
  return occ;
}

const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function parseMessage(raw: unknown, index = 0): Parsed<SavedMessage> {
  const where = `Message ${index + 1}`;
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where} isn't valid.` };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id))
    return { ok: false, error: `${where} has no valid ID.` };
  const name = line(r.name);
  if (!name) return { ok: false, error: `${where} needs a name.` };
  if (name.length > MESSAGE_LIMITS.name)
    return { ok: false, error: `Names can be ${MESSAGE_LIMITS.name} characters at most.` };
  const card = parseCard(r.card, name);
  if (!card.ok) return card;

  if (!Array.isArray(r.buttons)) return { ok: false, error: `${where} isn't valid.` };
  if (r.buttons.length > MESSAGE_LIMITS.buttons)
    return { ok: false, error: `${name}: up to ${MESSAGE_LIMITS.buttons} link buttons.` };
  const buttons: LinkButton[] = [];
  for (const b of r.buttons) {
    const o = (b ?? {}) as Record<string, unknown>;
    const label = line(o.label);
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!label || label.length > MESSAGE_LIMITS.label)
      return { ok: false, error: `${name}: each button needs a label of up to 80 characters.` };
    let ok = false;
    try {
      ok = url.length <= MESSAGE_LIMITS.url && new URL(url).protocol === "https:";
    } catch {}
    if (!ok)
      return { ok: false, error: `${name}: "${label}" needs a link starting with https://.` };
    buttons.push({ label, url });
  }

  let channelId: string | null = null;
  if (r.channelId) {
    if (typeof r.channelId !== "string" || !SNOWFLAKE.test(r.channelId))
      return { ok: false, error: `${name}: pick a channel from this server.` };
    channelId = r.channelId;
  }

  let schedule: Schedule | null = null;
  if (r.schedule) {
    const s = r.schedule as Record<string, unknown>;
    const at = typeof s.at === "string" ? s.at : "";
    if (!wallToUtc(at, "UTC")) return { ok: false, error: `${name}: pick a date and time.` };
    const repeat: Repeat = s.repeat === "daily" || s.repeat === "weekly" ? s.repeat : "none";
    if (!channelId) return { ok: false, error: `${name}: pick a channel to schedule it in.` };
    schedule = { at, repeat };
  }
  return { ok: true, value: { id: r.id, name, card: card.value, buttons, channelId, schedule } };
}

/** Stored messages, read leniently: anything that no longer parses is skipped. */
export function readMessages(raw: unknown): SavedMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m, i) => {
    const msg = parseMessage(m, i);
    return msg.ok ? [msg.value] : [];
  });
}

/** Scheduled messages past the plan's limit pause, in list order. */
export function pausedSchedules(messages: SavedMessage[], ent: Entitlements): Set<string> {
  const scheduled = messages.filter((m) => m.schedule);
  return new Set(scheduled.slice(ent["messages.scheduled"]).map((m) => m.id));
}

/** Pro rules one message breaks on this plan. `before` is the same message as saved. */
export function messagePlanProblems(
  m: SavedMessage,
  ent: Entitlements,
  before?: SavedMessage | null,
): string[] {
  const out = lockedCardFields(m.card, ent, before?.card).map(
    (f) => `${f.label} is part of Garrison Pro.`,
  );
  if (!ent["messages.extras"]) {
    if (m.buttons.length && JSON.stringify(m.buttons) !== JSON.stringify(before?.buttons ?? []))
      out.push("Link buttons are part of Garrison Pro.");
    if (
      m.schedule?.repeat &&
      m.schedule.repeat !== "none" &&
      m.schedule.repeat !== before?.schedule?.repeat
    )
      out.push("Repeating schedules are part of Garrison Pro.");
  }
  return out;
}

/**
 * Check the whole list against the plan. `before` is the list as saved: what was
 * already saved is let through, so a server back on Free keeps editing (extra
 * schedules pause, nothing is lost).
 */
export function checkMessages(
  raw: unknown,
  ent: Entitlements,
  before: SavedMessage[] = [],
): Parsed<SavedMessage[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Messages must be a list." };
  if (raw.length > MESSAGE_LIMITS.saved)
    return { ok: false, error: `A server can keep ${MESSAGE_LIMITS.saved} messages at most.` };
  const out: SavedMessage[] = [];
  for (const [i, m] of raw.entries()) {
    const msg = parseMessage(m, i);
    if (!msg.ok) return msg;
    if (out.some((x) => x.id === msg.value.id))
      return { ok: false, error: "Two messages share an ID. Refresh and try again." };
    const problem = messagePlanProblems(
      msg.value,
      ent,
      before.find((b) => b.id === msg.value.id),
    )[0];
    if (problem) return { ok: false, error: `${msg.value.name}: ${problem}` };
    out.push(msg.value);
  }
  const scheduled = out.filter((m) => m.schedule).length;
  const was = before.filter((m) => m.schedule).length;
  const limit = ent["messages.scheduled"];
  if (scheduled > limit && scheduled > was)
    return {
      ok: false,
      error: `Free servers can schedule ${limit} messages. Garrison Pro schedules up to ${SCHEDULED_HARD_MAX}.`,
    };
  return { ok: true, value: out };
}
