import { addWeeksInZone, wallTimeIn } from "./time";

/**
 * Raids on a calendar: a month-style grid for the website and an ICS feed for
 * Google, Apple and Outlook calendars. A weekly raid has one scheduled row at a
 * time, so later weeks are projected here (marked `projected`) rather than stored.
 */

export interface CalendarRaid {
  id: string;
  seriesId: string;
  title: string;
  note: string | null;
  startsAt: Date;
  timezone: string;
  repeatWeekly: boolean;
  status: "scheduled" | "cancelled" | "done";
}

export interface CalendarItem {
  id: string;
  title: string;
  startsAt: Date;
  /** A later week of a weekly raid: not posted yet. */
  projected: boolean;
}

export interface CalendarDay {
  /** YYYY-MM-DD in the server's time zone. */
  key: string;
  day: number;
  month: number;
  today: boolean;
  past: boolean;
  items: CalendarItem[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const dayKey = (d: Date, tz: string) => {
  const w = wallTimeIn(d, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
};

/** Each raid once, plus later weeks of weekly raids, up to `until`. */
export function expandRaids(raids: CalendarRaid[], until: Date): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const r of raids) {
    if (r.status === "cancelled") continue;
    out.push({ id: r.id, title: r.title, startsAt: r.startsAt, projected: false });
    if (!r.repeatWeekly || r.status !== "scheduled") continue;
    for (let n = 1; n <= 8; n++) {
      const next = addWeeksInZone(r.startsAt, n, r.timezone);
      if (next > until) break;
      out.push({ id: `${r.id}:${n}`, title: r.title, startsAt: next, projected: true });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * `weeks` rows of seven days (Monday first) in `tz`, starting with the week that
 * holds `now`. Days are walked at local noon, so a daylight-saving change never
 * skips or repeats one.
 */
export function calendarWeeks(
  raids: CalendarRaid[],
  tz: string,
  now: Date,
  weeks = 5,
): CalendarDay[][] {
  const w = wallTimeIn(now, tz);
  const todayUtc = Date.UTC(w.year, w.month - 1, w.day, 12);
  const weekday = (new Date(todayUtc).getUTCDay() + 6) % 7; // Monday 0
  const start = todayUtc - weekday * 86_400_000;
  const todayKey = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  const items = expandRaids(raids, new Date(start + (weeks * 7 + 1) * 86_400_000));
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of items) {
    const k = dayKey(i.startsAt, tz);
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const rows: CalendarDay[][] = [];
  for (let r = 0; r < weeks; r++) {
    const row: CalendarDay[] = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(start + (r * 7 + c) * 86_400_000);
      const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      row.push({
        key,
        day: d.getUTCDate(),
        month: d.getUTCMonth() + 1,
        today: key === todayKey,
        past: key < todayKey,
        items: byDay.get(key) ?? [],
      });
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// ICS (RFC 5545)
// ---------------------------------------------------------------------------

/** Text values: backslash, semicolon, comma and newlines escaped. */
export function icsText(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line after a space. */
export function icsFold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const localStamp = (d: Date, tz: string) => {
  const w = wallTimeIn(d, tz);
  return `${w.year}${pad(w.month)}${pad(w.day)}T${pad(w.hour)}${pad(w.minute)}00`;
};

export interface IcsInput {
  calendarName: string;
  raids: CalendarRaid[];
  /** Where a raid can be signed up for, put in each event. */
  url: string | null;
  now: Date;
}

/**
 * The feed. Raids have no end time, so each is two hours long. A weekly raid is
 * one repeating event (in its own time zone, so it keeps its local time across
 * daylight saving); raids already run stay as single events.
 */
export function buildIcs({ calendarName, raids, url, now }: IcsInput) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Garrison//Ops//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const r of raids) {
    if (r.status === "cancelled") continue;
    const weekly = r.repeatWeekly && r.status === "scheduled";
    const zoned = weekly && r.timezone !== "UTC" && r.timezone !== "Etc/UTC";
    const description = [r.note, url ? `Sign up: ${url}` : null].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${weekly ? `series-${r.seriesId}` : r.id}@garrison`,
      `DTSTAMP:${utcStamp(now)}`,
      zoned
        ? `DTSTART;TZID=${r.timezone}:${localStamp(r.startsAt, r.timezone)}`
        : `DTSTART:${utcStamp(r.startsAt)}`,
      "DURATION:PT2H",
      ...(weekly ? ["RRULE:FREQ=WEEKLY"] : []),
      `SUMMARY:${icsText(r.title)}`,
      ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
      ...(url ? [`URL:${url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}
