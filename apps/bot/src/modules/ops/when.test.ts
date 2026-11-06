import { describe, expect, it } from "vitest";
import { parseTimeZone, parseWhen } from "./when.js";

const NOW = Date.parse("2026-11-06T12:00:00Z");

describe("parseWhen", () => {
  it("reads dates in the given time zone", () => {
    expect(parseWhen("2026-11-12 20:00", "America/Chicago", NOW)).toEqual({
      ok: true,
      value: new Date("2026-11-13T02:00:00Z"),
    });
    expect(parseWhen("2026-11-12 8pm", "America/Chicago", NOW)).toEqual({
      ok: true,
      value: new Date("2026-11-13T02:00:00Z"),
    });
    expect(parseWhen("2026-11-12 12am", "UTC", NOW)).toEqual({
      ok: true,
      value: new Date("2026-11-12T00:00:00Z"),
    });
  });

  it("reads times from now", () => {
    expect(parseWhen("2d", "UTC", NOW)).toEqual({
      ok: true,
      value: new Date(NOW + 2 * 86_400_000),
    });
    expect(parseWhen("in 3h", "UTC", NOW)).toEqual({
      ok: true,
      value: new Date(NOW + 3 * 3_600_000),
    });
  });

  it("rejects the past, the far future, impossible dates and nonsense", () => {
    for (const bad of [
      "2026-11-01 20:00",
      "2027-06-01 20:00",
      "2026-02-30 20:00",
      "2026-11-12 25:00",
      "2026-11-12 13pm",
      "thursday",
    ]) {
      expect(parseWhen(bad, "UTC", NOW)).toMatchObject({ ok: false });
    }
  });
});

describe("parseTimeZone", () => {
  it("falls back to the server default and validates names", () => {
    expect(parseTimeZone(null, "America/Chicago")).toEqual({ ok: true, value: "America/Chicago" });
    expect(parseTimeZone("Europe/London", "UTC")).toEqual({ ok: true, value: "Europe/London" });
    expect(parseTimeZone("CST'; drop table", "UTC")).toMatchObject({ ok: false });
  });
});
