/**
 * Fun extras (best bot item 12): birthdays, a counting channel and trivia. Pure and shared.
 * Free on every plan.
 */

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Whether a month and day is a real date in some year (Feb 29 counts). */
export const validBirthday = (month: number, day: number) =>
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= (DAYS_IN[month - 1] ?? 0);

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** A date in a time zone, as YYYY-MM-DD and its parts. A bad zone falls back to UTC. */
export function localDate(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    return localDate(now, "UTC");
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/**
 * Which month-days are celebrated on a date: the day itself, and on Feb 28 of a year without
 * Feb 29, those born on the 29th too.
 */
export function birthdaysOn(date: { year: number; month: number; day: number }) {
  const out = [{ month: date.month, day: date.day }];
  if (date.month === 2 && date.day === 28 && !isLeap(date.year)) out.push({ month: 2, day: 29 });
  return out;
}

/**
 * A message in the counting channel: the number it starts with, or null when it doesn't start
 * with one (chatter is left alone). "12", "12!" and "12 nice" all count as 12.
 */
export function countedNumber(text: string): number | null {
  const m = /^\s*(\d{1,9})(?!\d)/.exec(text);
  return m?.[1] ? Number(m[1]) : null;
}

/** What a counted number does: carry on, or break the count (wrong number or twice in a row). */
export function countStep(
  state: { count: number; lastUserId: string | null },
  number: number,
  userId: string,
): { ok: true; count: number } | { ok: false; reason: "wrong" | "twice"; expected: number } {
  const expected = state.count + 1;
  if (state.lastUserId === userId && state.count > 0)
    return { ok: false, reason: "twice", expected };
  if (number !== expected) return { ok: false, reason: "wrong", expected };
  return { ok: true, count: number };
}
