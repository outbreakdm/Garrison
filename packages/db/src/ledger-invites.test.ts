import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { exportLedger, recordLedgerEvent, topInviters } from "./repo/ledger";
import { createTestDb } from "./testing";

describe("invite tracking and export", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "1002";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("counts joins per inviter and exports with filters", async () => {
    const join = (target: string, inviterId: string | null) =>
      recordLedgerEvent(db, {
        guildId: G,
        type: "member_join",
        summary: "joined",
        actorId: inviterId,
        targetId: target,
        channelId: null,
        data: inviterId ? { invite: "abc", inviterId, inviterName: `n${inviterId}` } : {},
      });
    await join("t1", "100000000000000001");
    await join("t2", "100000000000000001");
    await join("t3", "100000000000000002");
    await join("t4", null);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect(await topInviters(db, G)).toEqual([
      { inviterId: "100000000000000001", inviterName: "n100000000000000001", joins: 2 },
      { inviterId: "100000000000000002", inviterName: "n100000000000000002", joins: 1 },
    ]);
    expect(await exportLedger(db, { guildId: G })).toHaveLength(4);
    expect(await exportLedger(db, { guildId: G, userId: "100000000000000002" })).toHaveLength(1);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
  });
});
