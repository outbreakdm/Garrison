import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { birthdaysOn, countedNumber, countStep, localDate, validBirthday } from "./fun";
import {
  advanceCount,
  birthdaysFor,
  claimBirthdayDate,
  getFunState,
  resetCount,
  setBirthday,
} from "./repo/fun";
import { upsertGuild } from "./repo/guilds";
import { createTestDb } from "./testing";

describe("fun", () => {
  it("knows real dates, and celebrates Feb 29 on Feb 28 when there's no leap day", () => {
    expect(validBirthday(2, 29)).toBe(true);
    expect(validBirthday(4, 31)).toBe(false);
    expect(validBirthday(13, 1)).toBe(false);
    expect(birthdaysOn({ year: 2027, month: 2, day: 28 })).toEqual([
      { month: 2, day: 28 },
      { month: 2, day: 29 },
    ]);
    expect(birthdaysOn({ year: 2028, month: 2, day: 28 })).toEqual([{ month: 2, day: 28 }]);
  });

  it("reads the date in the server's time zone", () => {
    const late = new Date("2026-11-20T23:30:00Z");
    expect(localDate(late, "UTC").key).toBe("2026-11-20");
    expect(localDate(late, "Asia/Tokyo").key).toBe("2026-11-21");
    expect(localDate(late, "Not/AZone").key).toBe("2026-11-20");
  });

  it("counts numbers at the start of a message and leaves chatter alone", () => {
    expect(countedNumber("12")).toBe(12);
    expect(countedNumber(" 12! nice")).toBe(12);
    expect(countedNumber("nice 12")).toBeNull();
    expect(countedNumber("12345678901")).toBeNull();
  });

  it("breaks the count on a wrong number or counting twice in a row", () => {
    expect(countStep({ count: 4, lastUserId: "a" }, 5, "b")).toEqual({ ok: true, count: 5 });
    expect(countStep({ count: 4, lastUserId: "a" }, 6, "b")).toEqual({
      ok: false,
      reason: "wrong",
      expected: 5,
    });
    expect(countStep({ count: 4, lastUserId: "a" }, 5, "a")).toEqual({
      ok: false,
      reason: "twice",
      expected: 5,
    });
    // After a reset anyone can start.
    expect(countStep({ count: 0, lastUserId: null }, 1, "a")).toEqual({ ok: true, count: 1 });
  });
});

describe("fun storage, as garrison_bot", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "100000000000000555";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await upsertGuild(db, { id: G, name: "Fun Town" });
    await exec("SET ROLE garrison_bot");
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("counts once even when two messages race, and keeps the best", async () => {
    expect(await advanceCount(db, G, 0, 1, "a")).toBe(true);
    expect(await advanceCount(db, G, 0, 1, "b")).toBe(false);
    expect(await advanceCount(db, G, 1, 2, "b")).toBe(true);
    await resetCount(db, G);
    expect(await getFunState(db, G)).toMatchObject({ count: 0, lastUserId: null, best: 2 });
  });

  it("runs birthdays once a day and finds who's celebrating", async () => {
    await setBirthday(db, { guildId: G, userId: "u1", month: 2, day: 29 });
    await setBirthday(db, { guildId: G, userId: "u2", month: 7, day: 4 });
    expect(await claimBirthdayDate(db, G, "2027-02-28")).toEqual({ holders: [] });
    expect(await claimBirthdayDate(db, G, "2027-02-28")).toBeNull();
    const today = birthdaysOn({ year: 2027, month: 2, day: 28 });
    expect((await birthdaysFor(db, G, today)).map((b) => b.userId)).toEqual(["u1"]);
  });
});
