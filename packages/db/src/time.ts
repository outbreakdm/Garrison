/**
 * Time-zone helpers built on Intl, with no dependencies. Raids are set in
 * local wall-clock time ("Thursday 8 PM Chicago"), so weekly repeats must
 * keep that time across daylight-saving changes.
 */

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock time in `tz` at instant `date`. */
export function wallTimeIn(date: Date, tz: string): WallTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

const offsetMs = (utcMs: number, tz: string) => {
  const w = wallTimeIn(new Date(utcMs), tz);
  return (
    Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(utcMs / 60_000) * 60_000
  );
};

/** The instant when the wall clock in `tz` shows this time. */
export function zonedToUtc(w: WallTime, tz: string): Date {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  let guess = naive - offsetMs(naive, tz);
  // A second pass settles times near a daylight-saving switch.
  guess = naive - offsetMs(guess, tz);
  return new Date(guess);
}

/** Same local time, `weeks` weeks later, in `tz`. */
export function addWeeksInZone(date: Date, weeks: number, tz: string): Date {
  const w = wallTimeIn(date, tz);
  const shifted = new Date(Date.UTC(w.year, w.month - 1, w.day + weeks * 7));
  return zonedToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: w.hour,
      minute: w.minute,
    },
    tz,
  );
}

/** Same local time, `days` days later, in `tz`. */
export function addDaysInZone(date: Date, days: number, tz: string): Date {
  const w = wallTimeIn(date, tz);
  const shifted = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return zonedToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: w.hour,
      minute: w.minute,
    },
    tz,
  );
}
