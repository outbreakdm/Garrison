import { describe, expect, it } from "vitest";
import { relativeTime } from "./time";

const now = new Date("2026-11-10T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe("relativeTime", () => {
  it("says recent times as minutes, hours and days ago", () => {
    expect(relativeTime(at(-20_000), now)).toBe("just now");
    expect(relativeTime(at(-5 * MIN), now)).toBe("5 min ago");
    expect(relativeTime(at(-3 * H), now)).toBe("3 h ago");
    expect(relativeTime(at(-47 * H), now)).toBe("47 h ago");
    expect(relativeTime(at(-9 * D), now)).toBe("9 d ago");
  });

  it("says what's coming the same way", () => {
    expect(relativeTime(at(26 * H), now)).toBe("in 26 h");
    expect(relativeTime(at(6 * D), now)).toBe("in 6 d");
  });

  it("gives the date once it's more than two weeks away, with the year when it differs", () => {
    expect(relativeTime(new Date("2026-10-01T08:00:00Z"), now)).toBe("Oct 1");
    expect(relativeTime(new Date("2025-03-14T18:00:00Z"), now)).toBe("Mar 14, 2025");
  });
});
