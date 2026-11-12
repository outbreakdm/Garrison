import { describe, expect, it } from "vitest";
import {
  buildIcs,
  type CalendarRaid,
  calendarWeeks,
  expandRaids,
  icsFold,
  icsText,
} from "./ops-calendar";

const raid = (over: Partial<CalendarRaid> = {}): CalendarRaid => ({
  id: "00000000-0000-4000-8000-000000000001",
  seriesId: "00000000-0000-4000-8000-0000000000aa",
  title: "Molten Core",
  note: null,
  startsAt: new Date("2026-10-30T01:00:00Z"), // Thu Oct 29, 8 PM Chicago (CDT)
  timezone: "America/Chicago",
  repeatWeekly: false,
  status: "scheduled",
  ...over,
});

describe("calendar grid", () => {
  it("starts on the Monday of this week, in the server's time zone", () => {
    // 03:00 UTC Monday Nov 16 is still Sunday Nov 15 in Chicago.
    const weeks = calendarWeeks([], "America/Chicago", new Date("2026-11-16T03:00:00Z"), 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.[0]?.key).toBe("2026-11-09");
    expect(weeks[0]?.[6]).toMatchObject({ key: "2026-11-15", today: true, past: false });
    expect(weeks[0]?.[5]?.past).toBe(true);
    expect(weeks[1]?.[0]?.key).toBe("2026-11-16");
  });

  it("puts a raid on its local day and projects weekly ones, keeping local time across DST", () => {
    const weeks = calendarWeeks(
      [raid({ repeatWeekly: true })],
      "America/Chicago",
      new Date("2026-10-27T12:00:00Z"),
      3,
    );
    const days = weeks.flat().filter((d) => d.items.length);
    expect(days.map((d) => d.key)).toEqual(["2026-10-29", "2026-11-05", "2026-11-12"]);
    expect(days[0]?.items[0]?.projected).toBe(false);
    expect(days[1]?.items[0]?.projected).toBe(true);
    // After DST ends, 8 PM Chicago is 02:00 UTC.
    expect(days[1]?.items[0]?.startsAt.toISOString()).toBe("2026-11-06T02:00:00.000Z");
  });

  it("leaves out cancelled raids and doesn't repeat finished ones", () => {
    const items = expandRaids(
      [raid({ status: "cancelled" }), raid({ id: "b", status: "done", repeatWeekly: true })],
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(items.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("ICS feed", () => {
  it("escapes text and folds long lines at 75 octets", () => {
    expect(icsText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const folded = icsFold(`SUMMARY:${"x".repeat(100)}`);
    const lines = folded.split("\r\n");
    expect(lines[0]).toHaveLength(75);
    expect(lines[1]?.startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"x".repeat(100)}`);
    // Never splits a multi-byte character.
    expect(icsFold(`SUMMARY:${"é".repeat(60)}`).replace(/\r\n /g, "")).toBe(
      `SUMMARY:${"é".repeat(60)}`,
    );
  });

  it("writes single raids in UTC and weekly ones as a repeating local-time event", () => {
    const ics = buildIcs({
      calendarName: "Iron Vanguard raids",
      raids: [
        raid({ note: "Bring fire resist, flasks" }),
        raid({ id: "w", repeatWeekly: true }),
        raid({ id: "c", status: "cancelled" }),
      ],
      url: "https://example.test/play/1",
      now: new Date("2026-10-01T00:00:00Z"),
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20261030T010000Z");
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20261029T200000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY");
    expect(ics).toContain("UID:series-00000000-0000-4000-8000-0000000000aa@garrison");
    expect(ics).toContain("Bring fire resist\\, flasks");
  });
});
