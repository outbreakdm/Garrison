import { describe, expect, it } from "vitest";
import { datesAsText } from "./client";

describe("dates sent to postgres-js", () => {
  it("turns a Date into ISO text and leaves everything else as Drizzle sends it", () => {
    const pass = (v: unknown) => v;
    const serializers: Record<string, unknown> = { "1184": pass, "1114": pass };
    datesAsText(serializers);
    const tz = serializers["1184"] as (v: unknown) => unknown;
    expect(tz(new Date("2026-11-20T01:00:00Z"))).toBe("2026-11-20T01:00:00.000Z");
    expect(tz("2026-11-20 01:00:00+00")).toBe("2026-11-20 01:00:00+00");
    // A type Drizzle hadn't touched still gets the Date handling.
    expect((serializers["1082"] as (v: unknown) => unknown)(new Date(0))).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });
});
