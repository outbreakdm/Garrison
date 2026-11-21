import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { eraseMyData, exportMyData } from "./repo/account";
import { setBirthday } from "./repo/fun";
import { upsertGuild } from "./repo/guilds";
import { createTestDb } from "./testing";

describe("your data, as garrison_web", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "100000000000000444";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await upsertGuild(db, { id: G, name: "Birthday Club" });
    // Saved with /birthday, which runs as the bot.
    await exec("SET ROLE garrison_bot");
    await setBirthday(db, { guildId: G, userId: "u1", month: 3, day: 14 });
    await setBirthday(db, { guildId: G, userId: "u2", month: 5, day: 1 });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("downloads a member's birthdays with their data", async () => {
    expect((await exportMyData(db, "u1")).birthdays).toEqual([
      { serverId: G, server: "Birthday Club", month: 3, day: 14 },
    ]);
  });

  it("erases a member's birthdays, and only theirs", async () => {
    expect((await eraseMyData(db, "u1")).birthdays).toBe(1);
    expect((await exportMyData(db, "u1")).birthdays).toEqual([]);
    expect((await exportMyData(db, "u2")).birthdays).toHaveLength(1);
  });
});
