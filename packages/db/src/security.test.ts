import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client.js";
import {
  countActiveWarnings,
  createCase,
  getCase,
  listCasesForTarget,
  revokeCase,
} from "./repo/cases.js";
import {
  endLockdown,
  getActiveLockdown,
  getGatehouseSettings,
  listExpiredLockdowns,
  saveLockdownSnapshot,
  startLockdown,
  updateGatehouseSettings,
} from "./repo/gatehouse.js";
import {
  getWatchSettings,
  listEscalationRules,
  markGuildLeft,
  updateWatchSettings,
  upsertGuild,
} from "./repo/guilds.js";
import { guilds, modCases } from "./schema.js";
import { createTestDb } from "./testing.js";

/**
 * Everything here runs as the least-privilege `garrison_bot` role, not the
 * superuser, so a missing grant or policy fails these tests before it fails
 * in production.
 */
let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
});
afterAll(() => close());

const mod = { moderatorId: "1", moderatorTag: "taner" };

/** Expect Postgres to refuse with "permission denied" (Drizzle wraps it in `cause`). */
async function expectDenied(query: PromiseLike<unknown>) {
  const error = await Promise.resolve(query).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "query should have been refused").toBeInstanceOf(Error);
  const err = error as Error & { cause?: Error };
  expect(`${err.message} ${err.cause?.message ?? ""}`).toMatch(/permission denied/);
}

describe("garrison_bot can do everything the bot does", () => {
  it("runs every repo function", async () => {
    const G = "500";
    expect(await upsertGuild(db, { id: G, name: "Scapewatch" })).toEqual({ created: true });
    expect(await upsertGuild(db, { id: G, name: "Renamed" })).toEqual({ created: false });
    await updateWatchSettings(db, G, { logChannelId: "9" });
    expect((await getWatchSettings(db, G)).logChannelId).toBe("9");
    expect(await listEscalationRules(db, G)).toHaveLength(1);

    const c = await createCase(db, { guildId: G, action: "warn", targetId: "7", ...mod });
    expect(await getCase(db, G, c.caseNumber)).not.toBeNull();
    expect(await countActiveWarnings(db, G, "7", new Date(0))).toBe(1);
    expect(await revokeCase(db, G, c.caseNumber, "1")).not.toBeNull();
    expect(await listCasesForTarget(db, G, "7")).toHaveLength(1);

    await updateGatehouseSettings(db, G, { staffRoleIds: ["5"] });
    expect((await getGatehouseSettings(db, G)).staffRoleIds).toEqual(["5"]);
    const l = await startLockdown(db, {
      guildId: G,
      source: "manual",
      reason: null,
      startedById: "1",
      endsAt: new Date(0),
    });
    await saveLockdownSnapshot(db, l?.id ?? "", [], true);
    expect(await getActiveLockdown(db, G)).not.toBeNull();
    expect(await listExpiredLockdowns(db)).toHaveLength(1);
    expect(await endLockdown(db, l?.id ?? "", "1")).not.toBeNull();

    await markGuildLeft(db, G);
  });
});

describe("garrison_bot cannot tamper with history", () => {
  const G = "600";
  beforeAll(async () => {
    await upsertGuild(db, { id: G, name: "Other" });
    await createCase(db, { guildId: G, action: "ban", targetId: "7", reason: "Raid", ...mod });
  });

  it("can't rewrite a case's reason or action", async () => {
    await expectDenied(db.update(modCases).set({ reason: "nothing happened" }));
    await expectDenied(db.update(modCases).set({ action: "warn" }));
  });

  it("can't delete cases or guilds", async () => {
    await expectDenied(db.delete(modCases));
    await expectDenied(db.delete(guilds).where(eq(guilds.id, G)));
  });

  it("can't touch the migration journal", async () => {
    await expectDenied(exec("select * from drizzle.__drizzle_migrations"));
  });
});
