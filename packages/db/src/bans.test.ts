import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createCase, listExpiredBans, revokeCase } from "./repo/cases";
import { upsertGuild } from "./repo/guilds";
import { createTestDb } from "./testing";

describe("temporary bans", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "998";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("finds bans whose time is up, until they're lifted", async () => {
    const base = {
      guildId: G,
      action: "ban" as const,
      targetId: "100000000000000001",
      targetTag: "rook",
      moderatorId: "1",
      moderatorTag: "mod",
      reason: null,
    };
    const due = await createCase(db, {
      ...base,
      durationSeconds: 3600,
      expiresAt: new Date(Date.now() - 1000),
    });
    await createCase(db, {
      ...base,
      durationSeconds: 3600,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await createCase(db, { ...base, durationSeconds: null, expiresAt: null });
    expect((await listExpiredBans(db)).map((c) => c.caseNumber)).toEqual([due.caseNumber]);
    await revokeCase(db, G, due.caseNumber, "bot");
    expect(await listExpiredBans(db)).toEqual([]);
  });
});
