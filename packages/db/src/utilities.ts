/**
 * Small role and channel tools (best bot item 6), on the Utilities page:
 * - Roles back on rejoin: a member who leaves and comes back gets their roles again (never a
 *   bot's role, one above Garrison, or one with moderation powers; a server can skip more).
 * - Timed roles: `/temprole` gives a role for a while; Garrison takes it off when it's up.
 * - Sticky messages: a note Garrison keeps at the bottom of a channel, posted again after chat.
 * - Self-clearing channels: messages older than a set time are deleted, pins kept if wanted.
 * Pure and shared: the dashboard checks a list before saving, the bot reads it.
 *
 * Free: 1 sticky, 1 self-clearing channel, 25 timed roles running. Pro: 10, 10 and 1,000.
 * A server back on Free keeps what it made; past the limit the extra ones pause.
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export interface Sticky {
  /** Stable across edits. */
  id: string;
  channelId: string;
  /** What Garrison keeps at the bottom, in Discord markdown. Never pings. */
  text: string;
  enabled: boolean;
}

export interface ClearRule {
  id: string;
  channelId: string;
  /** Messages older than this are deleted. */
  hours: number;
  /** Pinned messages stay. */
  keepPinned: boolean;
  enabled: boolean;
}

export const UTILITY_LIMITS = {
  /** The most a server can keep of each, Pro included. */
  stickies: 10,
  clearing: 10,
  stickyText: 1500,
  skipRoles: 25,
  /** Discord deletes in bulk only up to 14 days back. */
  maxHours: 14 * 24,
} as const;

/** How long a member's roles are kept after they leave, for when they come back. */
export const ROLE_SNAPSHOT_DAYS = 180;
/** The longest a timed role can run. */
export const TIMED_ROLE_MAX_DAYS = 365;

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;

export const stickyLimit = (ent: Entitlements) => ent["utilities.stickies"];
export const clearLimit = (ent: Entitlements) => ent["utilities.clearing"];
export const timedRoleLimit = (ent: Entitlements) => ent["utilities.timedRoles"];

function parseSticky(raw: unknown, i: number): Parsed<Sticky> {
  if (!raw || typeof raw !== "object") return { ok: false, error: `Sticky ${i + 1} isn't valid.` };
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || !ID.test(s.id))
    return { ok: false, error: `Sticky ${i + 1} has no valid ID. Refresh and try again.` };
  if (typeof s.channelId !== "string" || !SNOWFLAKE.test(s.channelId))
    return { ok: false, error: `Sticky ${i + 1}: pick a channel from this server's list.` };
  const text = typeof s.text === "string" ? s.text.trim().replace(/\r\n/g, "\n") : "";
  if (!text) return { ok: false, error: `Sticky ${i + 1}: write what it says.` };
  if (text.length > UTILITY_LIMITS.stickyText)
    return {
      ok: false,
      error: `Sticky ${i + 1}: it holds ${UTILITY_LIMITS.stickyText.toLocaleString("en-US")} characters.`,
    };
  if (/@(everyone|here)\b/.test(text))
    return { ok: false, error: `Sticky ${i + 1} can't mention @everyone or @here.` };
  return {
    ok: true,
    value: { id: s.id, channelId: s.channelId, text, enabled: s.enabled !== false },
  };
}

function parseClearRule(raw: unknown, i: number): Parsed<ClearRule> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: `Self-clearing channel ${i + 1} isn't valid.` };
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || !ID.test(c.id))
    return { ok: false, error: "A self-clearing channel has no valid ID. Refresh and try again." };
  if (typeof c.channelId !== "string" || !SNOWFLAKE.test(c.channelId))
    return { ok: false, error: "Pick the channel to clear from this server's list." };
  const hours = Number(c.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > UTILITY_LIMITS.maxHours)
    return {
      ok: false,
      error: "Clear messages after 1 hour to 14 days: Discord deletes in bulk only that far back.",
    };
  return {
    ok: true,
    value: {
      id: c.id,
      channelId: c.channelId,
      hours,
      keepPinned: c.keepPinned !== false,
      enabled: c.enabled !== false,
    },
  };
}

/** A whole list: no more than the plan allows unless it's no longer than what's saved. */
function checkList<T extends { channelId: string }>(
  raw: unknown,
  parse: (x: unknown, i: number) => Parsed<T>,
  max: number,
  limit: number,
  before: number,
  what: { one: string; many: string },
): Parsed<T[]> {
  if (!Array.isArray(raw)) return { ok: false, error: `The ${what.many} must be a list.` };
  if (raw.length > max) return { ok: false, error: `A server can have ${max} ${what.many}.` };
  if (raw.length > limit && raw.length > before)
    return {
      ok: false,
      error: `Free servers can have ${limit} ${limit === 1 ? what.one : what.many}. Garrison Pro allows ${max}.`,
    };
  const out: T[] = [];
  for (const [i, x] of raw.entries()) {
    const p = parse(x, i);
    if (!p.ok) return p;
    if (out.some((o) => o.channelId === p.value.channelId))
      return { ok: false, error: `A channel can have one ${what.one}.` };
    out.push(p.value);
  }
  return { ok: true, value: out };
}

export const checkStickies = (raw: unknown, ent: Entitlements, before: Sticky[] = []) =>
  checkList(raw, parseSticky, UTILITY_LIMITS.stickies, stickyLimit(ent), before.length, {
    one: "sticky message",
    many: "sticky messages",
  });

export const checkClearRules = (raw: unknown, ent: Entitlements, before: ClearRule[] = []) =>
  checkList(raw, parseClearRule, UTILITY_LIMITS.clearing, clearLimit(ent), before.length, {
    one: "self-clearing setup",
    many: "self-clearing channels",
  });

/** Stored lists, read leniently: one that doesn't make sense is left out. */
export const readStickies = (raw: unknown): Sticky[] =>
  Array.isArray(raw)
    ? raw.flatMap((x, i) => {
        const p = parseSticky(x, i);
        return p.ok ? [p.value] : [];
      })
    : [];
export const readClearRules = (raw: unknown): ClearRule[] =>
  Array.isArray(raw)
    ? raw.flatMap((x, i) => {
        const p = parseClearRule(x, i);
        return p.ok ? [p.value] : [];
      })
    : [];

/** The ones working now: on, and within the plan's limit (the first in the list). */
export const activeStickies = (list: Sticky[], ent: Entitlements) =>
  list.slice(0, stickyLimit(ent)).filter((s) => s.enabled);
export const activeClearRules = (list: ClearRule[], ent: Entitlements) =>
  list.slice(0, clearLimit(ent)).filter((c) => c.enabled);

const UNITS: Record<string, number> = {
  m: 60_000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * A time like "30m", "2h", "3d", "1w" or "1d 12h", in milliseconds. Null when it isn't one,
 * or it's under a minute or over TIMED_ROLE_MAX_DAYS.
 */
export function parseDuration(text: string): number | null {
  const parts = text
    .trim()
    .toLowerCase()
    .match(/\d+\s*(min|m|h|d|w)\b/g);
  if (!parts || parts.join("").replace(/\s/g, "") !== text.toLowerCase().replace(/\s/g, ""))
    return null;
  let ms = 0;
  for (const p of parts) {
    const m = /^(\d+)\s*(min|m|h|d|w)$/.exec(p);
    if (!m?.[1] || !m[2]) return null;
    ms += Number(m[1]) * (UNITS[m[2]] ?? 0);
  }
  if (ms < 60_000 || ms > TIMED_ROLE_MAX_DAYS * 86_400_000) return null;
  return ms;
}
