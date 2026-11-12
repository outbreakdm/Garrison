import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { maskPermissions, readBackup, restorePlan, type ServerBackup } from "./backups";
import type { Db } from "./client";
import { getBackup, listBackups, recordRestore, saveBackup } from "./repo/backups";
import { upsertGuild } from "./repo/guilds";
import { serverBackups } from "./schema";
import { createTestDb } from "./testing";

const R1 = "200000000000000001";
const R2 = "200000000000000002";
const CAT = "300000000000000001";
const CH = "300000000000000002";
const backup: ServerBackup = {
  version: 1,
  roles: [
    {
      id: R1,
      name: "Mods",
      color: 1,
      hoist: true,
      mentionable: false,
      permissions: "8192",
      position: 2,
    },
    {
      id: R2,
      name: "Raiders",
      color: 2,
      hoist: false,
      mentionable: true,
      permissions: "0",
      position: 1,
    },
  ],
  channels: [
    {
      id: CAT,
      name: "Raids",
      type: 4,
      parentId: null,
      position: 0,
      topic: null,
      nsfw: false,
      rateLimit: 0,
      userLimit: 0,
      overwrites: [],
    },
    {
      id: CH,
      name: "raid-chat",
      type: 0,
      parentId: CAT,
      position: 1,
      topic: "Plans",
      nsfw: false,
      rateLimit: 0,
      userLimit: 0,
      overwrites: [{ id: R2, kind: "role", allow: "1024", deny: "0" }],
    },
  ],
};

describe("restore plans", () => {
  it("recreates only what's missing, roles lowest first", () => {
    const plan = restorePlan(backup, { roleIds: new Set([R1]), channelIds: new Set() });
    expect(plan.roles.map((r) => r.name)).toEqual(["Raiders"]);
    expect(plan.categories.map((c) => c.name)).toEqual(["Raids"]);
    expect(plan.channels.map((c) => c.name)).toEqual(["raid-chat"]);
  });

  it("counts what an earlier restore recreated as there", () => {
    const now = { roleIds: new Set([R1, "900"]), channelIds: new Set(["901", "902"]) };
    const plan = restorePlan(backup, now, { [R2]: "900", [CAT]: "901", [CH]: "902" });
    expect(plan.roles.length + plan.categories.length + plan.channels.length).toBe(0);
  });

  it("only grants what Garrison holds, and reads junk leniently", () => {
    expect(maskPermissions("8200", 8192n)).toEqual({ kept: 8192n, dropped: true });
    expect(maskPermissions("8192", 8192n)).toEqual({ kept: 8192n, dropped: false });
    expect(readBackup({ roles: [{ id: "x" }, { id: R1, permissions: "evil" }] }).roles).toEqual([
      {
        id: R1,
        name: "role",
        color: 0,
        hoist: false,
        mentionable: false,
        permissions: "0",
        position: 0,
      },
    ]);
  });
});

describe("backup storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "1001";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("rotates at the limit, remembers restores, and keeps snapshots from the dashboard", async () => {
    const b = {
      guildId: G,
      kind: "manual" as const,
      createdById: "1",
      createdByName: "taner",
      data: backup,
    };
    const first = await saveBackup(db, b, 1);
    const second = await saveBackup(db, b, 1);
    expect(first?.id).not.toBe(second?.id);
    expect((await listBackups(db, G)).map((x) => x.id)).toEqual([second?.id]);
    await recordRestore(db, second?.id as string, { [R2]: "900" });
    await recordRestore(db, second?.id as string, { [CAT]: "901" });
    expect((await getBackup(db, G, second?.id as string))?.restoredMap).toEqual({
      [R2]: "900",
      [CAT]: "901",
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect(await listBackups(db, G)).toHaveLength(1);
    // The dashboard lists backups but can't read the snapshots themselves.
    const err = await Promise.resolve(
      db.select({ data: serverBackups.data }).from(serverBackups),
    ).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
  });
});
