import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  endLockdown,
  getActiveLockdown,
  getGatehouseSettings,
  listExpiredLockdowns,
  saveLockdownSnapshot,
  startLockdown,
  updateGatehouseSettings,
} from "./repo/gatehouse";
import { upsertGuild } from "./repo/guilds";
import { createTestDb } from "./testing";

// One database for the file; each test uses its own guild ID.
let db: Db;
let close: () => Promise<void>;
let n = 0;
async function newGuild() {
  const id = `g${++n}`;
  await upsertGuild(db, { id, name: id });
  return id;
}
const lockdown = (guildId: string, endsAt: Date | null = null) =>
  startLockdown(db, { guildId, source: "manual", reason: null, startedById: "1", endsAt });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("gatehouse settings", () => {
  it("seeds defaults on join", async () => {
    const guildId = await newGuild();
    expect(await getGatehouseSettings(db, guildId)).toMatchObject({
      antiRaidEnabled: true,
      raidJoinCount: 10,
      raidWindowSeconds: 30,
      raidResponse: "lockdown",
      staffRoleIds: [],
    });
  });

  it("stores staff roles as an array", async () => {
    const guildId = await newGuild();
    const row = await updateGatehouseSettings(db, guildId, {
      staffRoleIds: ["5", "6"],
      raidJoinCount: 4,
    });
    expect(row).toMatchObject({ staffRoleIds: ["5", "6"], raidJoinCount: 4 });
  });
});

describe("lockdowns", () => {
  it("allows one active lockdown per guild", async () => {
    const guildId = await newGuild();
    const first = await lockdown(guildId);
    expect(first).not.toBeNull();
    expect(await lockdown(guildId)).toBeNull();
    expect((await getActiveLockdown(db, guildId))?.id).toBe(first?.id);

    expect(await endLockdown(db, first?.id ?? "", "2")).toMatchObject({ endedById: "2" });
    expect(await endLockdown(db, first?.id ?? "", "2")).toBeNull();
    expect(await getActiveLockdown(db, guildId)).toBeNull();
    expect(await lockdown(guildId)).not.toBeNull();
  });

  it("keeps the restore snapshot", async () => {
    const guildId = await newGuild();
    const row = await lockdown(guildId);
    const snapshot = [
      { channelId: "c1", targetId: guildId, type: 0 as const, before: null },
      {
        channelId: "c2",
        targetId: guildId,
        type: 0 as const,
        before: { allow: "0", deny: "1024" },
      },
    ];
    await saveLockdownSnapshot(db, row?.id ?? "", snapshot, true);
    expect(await getActiveLockdown(db, guildId)).toMatchObject({ snapshot, invitesPaused: true });
  });

  it("lists only active lockdowns past their end time", async () => {
    const past = await newGuild();
    const future = await newGuild();
    const open = await newGuild();
    const expired = await lockdown(past, new Date(Date.now() - 1000));
    await lockdown(future, new Date(Date.now() + 60_000));
    await lockdown(open, null);
    const ids = (await listExpiredLockdowns(db)).map((l) => l.id);
    expect(ids).toContain(expired?.id);
    expect(ids).toHaveLength(1);
  });
});
