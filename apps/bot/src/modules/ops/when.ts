import { isValidTimeZone, zonedToUtc } from "@garrison/db";
import { parseDuration } from "../../lib/duration.js";

export const MAX_AHEAD_MS = 90 * 86_400_000;
export type ParsedWhen = { ok: true; value: Date } | { ok: false; error: string };

const DATE_TIME = /^(\d{4})-(\d{1,2})-(\d{1,2})[ t]+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

/**
 * Parse when a raid starts: "2026-11-12 20:00", "2026-11-12 8pm" (in `tz`),
 * or a time from now: "2d", "3h 30m". Must be in the future, within 90 days.
 */
export function parseWhen(input: string, tz: string, now = Date.now()): ParsedWhen {
  const text = input.trim();
  const relative = parseDuration(text.replace(/^in\s+/i, ""));
  let date: Date | null = null;
  if (relative) {
    date = new Date(now + relative * 1000);
  } else {
    const m = text.match(DATE_TIME);
    if (!m) {
      return {
        ok: false,
        error:
          'Give a date and time like "2026-11-12 20:00" or "2026-11-12 8pm", or a time from now like 2d.',
      };
    }
    const [, y, mo, d, h, mi, ap] = m;
    let hour = Number(h);
    if (ap) {
      if (hour < 1 || hour > 12) return { ok: false, error: "With am/pm, the hour is 1 to 12." };
      hour = (hour % 12) + (ap.toLowerCase() === "pm" ? 12 : 0);
    }
    const parts = {
      year: Number(y),
      month: Number(mo),
      day: Number(d),
      hour,
      minute: Number(mi ?? 0),
    };
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    if (
      check.getUTCMonth() !== parts.month - 1 ||
      check.getUTCDate() !== parts.day ||
      hour > 23 ||
      parts.minute > 59
    ) {
      return { ok: false, error: "That date doesn't exist." };
    }
    date = zonedToUtc(parts, tz);
  }
  if (date.getTime() <= now) return { ok: false, error: "That time has already passed." };
  if (date.getTime() - now > MAX_AHEAD_MS)
    return { ok: false, error: "Schedule raids up to 90 days ahead." };
  return { ok: true, value: date };
}

export function parseTimeZone(
  input: string | null,
  fallback: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!input) return { ok: true, value: fallback };
  const tz = input.trim();
  if (!isValidTimeZone(tz)) {
    return {
      ok: false,
      error: `"${tz}" isn't a time zone I know. Use a name like America/Chicago or Europe/London.`,
    };
  }
  return { ok: true, value: tz };
}
