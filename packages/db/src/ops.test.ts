import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  cancelOpsEvent,
  claimDueReminders,
  countScheduledOps,
  createOpsEvent,
  finishPastEvents,
  getOpsTimezone,
  listSignups,
  listUpcomingOps,
  setOpsMessage,
  setOpsTimezone,
  signUp,
  withdraw,
} from "./repo/ops";
import { opsSignups } from "./schema";
import { createTestDb } from "./testing";
import { addWeeksInZone, isValidTimeZone, wallTimeIn, zonedToUtc } from "./time";

describe("time zones", () => {
  it("converts Chicago wall time to UTC on both sides of daylight saving", () => {
    // US daylight saving ends Nov 1 2026: Oct 29 is CDT (UTC-5), Nov 12 is CST (UTC-6).
    expect(
      zonedToUtc(
        { year: 2026, month: 10, day: 29, hour: 20, minute: 0 },
        "America/Chicago",
      ).toISOString(),
    ).toBe("2026-10-30T01:00:00.000Z");
    expect(
      zonedToUtc(
        { year: 2026, month: 11, day: 12, hour: 20, minute: 0 },
        "America/Chicago",
      ).toISOString(),
    ).toBe("2026-11-13T02:00:00.000Z");
  });

  it("keeps 8 PM local when a weekly raid crosses the DST switch", () => {
    const before = zonedToUtc(
      { year: 2026, month: 10, day: 29, hour: 20, minute: 0 },
      "America/Chicago",
    );
    const next = addWeeksInZone(before, 1, "America/Chicago");
    expect(wallTimeIn(next, "America/Chicago")).toMatchObject({
      month: 11,
      day: 5,
      hour: 20,
      minute: 0,
    });
    expect(next.getTime() - before.getTime()).toBe(7 * 86_400_000 + 3_600_000);
  });

  it("validates zone names", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

// Everything below runs as garrison_bot.
let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "800";
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

const slots = [
  { name: "Tank", count: 2 },
  { name: "Healer", count: 1 },
];
const raid = (startsAt = new Date(Date.now() + 2 * 86_400_000), repeatWeekly = false) =>
  createOpsEvent(db, {
    guildId: G,
    channelId: "c",
    hostId: "h",
    title: "Molten Core",
    note: null,
    slots,
    startsAt,
    timezone: "America/Chicago",
    repeatWeekly,
  });

describe("ops events", () => {
  it("stores a server time zone", async () => {
    expect(await getOpsTimezone(db, G)).toBe("UTC");
    await setOpsTimezone(db, G, "America/Chicago");
    await setOpsTimezone(db, G, "Europe/London");
    expect(await getOpsTimezone(db, G)).toBe("Europe/London");
  });

  it("benches signups past the role cap and promotes in order when someone withdraws", async () => {
    const e = await raid();
    const id = e?.id ?? "";
    await setOpsMessage(db, id, "m");
    expect(await signUp(db, id, "brannoc", "Tank", "Prot")).toMatchObject({
      ok: true,
      benched: null,
    });
    expect(await signUp(db, id, "vhaltar", "Tank", "Bear")).toMatchObject({
      ok: true,
      benched: null,
    });
    expect(await signUp(db, id, "dorn", "Tank", "Warrior")).toMatchObject({
      ok: true,
      benched: "role_full",
    });
    expect(await signUp(db, id, "pip", "Tank", null)).toMatchObject({
      ok: true,
      benched: "role_full",
    });
    expect(await signUp(db, id, "pip", "Tank", null)).toEqual({ ok: false, reason: "unchanged" });

    const w = await withdraw(db, id, "brannoc");
    expect(w.ok && w.promoted?.userId).toBe("dorn");
    const roster = await listSignups(db, id);
    expect(
      roster
        .filter((s) => s.role === "Tank" && !s.bench)
        .map((s) => s.userId)
        .sort(),
    ).toEqual(["dorn", "vhaltar"]);
    expect(roster.find((s) => s.userId === "pip")?.bench).toBe(true);
  });

  it("lets people bench themselves, switch role, and rejects unknown roles", async () => {
    const e = await raid();
    const id = e?.id ?? "";
    expect(await signUp(db, id, "a", "Healer", "Priest", true)).toMatchObject({
      ok: true,
      benched: "asked",
    });
    expect(await signUp(db, id, "a", "Healer", "Priest")).toMatchObject({
      ok: true,
      benched: null,
    });
    expect(await signUp(db, id, "a", "Bard", null)).toEqual({ ok: false, reason: "no_such_role" });
    expect(await withdraw(db, id, "nobody")).toEqual({ ok: false, reason: "not_signed_up" });
  });

  it("holds role caps when many sign up at once", async () => {
    const e = await raid();
    const results = await Promise.all(
      ["p", "q", "r", "s"].map((u) => signUp(db, e?.id ?? "", u, "Healer", null)),
    );
    const seated = results.filter((r) => r.ok && r.benched === null);
    expect(seated).toHaveLength(1);
  });

  it("claims each reminder once", async () => {
    const soon = await raid(new Date(Date.now() + 20 * 60_000));
    const first24 = (await claimDueReminders(db, "24h")).map((e) => e.id);
    expect(first24).toContain(soon?.id);
    expect((await claimDueReminders(db, "24h")).map((e) => e.id)).not.toContain(soon?.id);
    expect((await claimDueReminders(db, "30m")).map((e) => e.id)).toContain(soon?.id);
  });

  it("finishes past events and schedules the next week of a repeating one", async () => {
    const past = await raid(new Date(Date.now() - 4 * 3_600_000), true);
    const { done, next } = await finishPastEvents(db);
    expect(done.map((e) => e.id)).toContain(past?.id);
    const repeat = next.find((e) => e.seriesId === past?.seriesId);
    expect(repeat?.startsAt.getTime()).toBeGreaterThan(Date.now());
    expect((await listUpcomingOps(db, G)).map((e) => e.id)).toContain(repeat?.id);
    expect((await finishPastEvents(db)).next).toHaveLength(0);
  });

  it("cancels once, and counts what's scheduled", async () => {
    const e = await raid();
    const before = await countScheduledOps(db, G);
    expect(await cancelOpsEvent(db, e?.id ?? "")).toMatchObject({ status: "cancelled" });
    expect(await cancelOpsEvent(db, e?.id ?? "")).toBeNull();
    expect(await signUp(db, e?.id ?? "", "z", "Tank", null)).toEqual({
      ok: false,
      reason: "closed",
    });
    expect(await countScheduledOps(db, G)).toBe(before - 1);
  });

  it("can't delete signups", async () => {
    const error = await db.delete(opsSignups).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message}`,
    );
    expect(error).toMatch(/permission denied/);
  });
});
