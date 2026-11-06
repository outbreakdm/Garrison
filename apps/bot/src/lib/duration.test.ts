import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration.js";

describe("parseDuration", () => {
  it.each([
    ["10m", 600],
    ["1h", 3600],
    ["1h30m", 5400],
    ["1 h 30 min", 5400],
    ["2d", 172_800],
    ["1w", 604_800],
    ["45s", 45],
    ["90sec", 90],
  ])("%s → %i s", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "10", "abc", "1x", "h1", "0m", "1h junk"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45 s"],
    [240, "4 min"],
    [3600, "1 h"],
    [5400, "1 h 30 min"],
    [86_400, "1 d"],
    [90_061, "1 d 1 h"],
    [86_460, "1 d"],
    [0, "0 s"],
  ])("%i s → %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
