import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { getGatehouseSettings } from "./repo/gatehouse";
import { getWatchSettings, listEscalationRules, upsertGuild } from "./repo/guilds";
import { applySettingsChange, listSettingsChanges, undoSettingsChange } from "./repo/settings";
import {
  escalationRules,
  gatehouseSettings,
  ledgerSettings,
  memberXp,
  rankRewards,
  settingsChanges,
} from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "950";
const taner = { userId: "1", username: "taner" };
const kel = { userId: "2", username: "kel" };

async function denied(query: PromiseLike<unknown>) {
  const err = await Promise.resolve(query).then(
    () => null,
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
  expect(err, "should be refused").toMatch(/permission denied/);
}

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
  await exec("RESET ROLE");
  await exec("SET ROLE garrison_web");
});
afterAll(() => close());

describe("dashboard settings, as garrison_web", () => {
  it("records exactly what changed, and nothing when nothing did", async () => {
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "watch",
      patch: { dmMembers: false, appealText: "DM @Mods", logChannelId: null },
      ...taner,
    });
    expect(r.ok && r.change.changes).toEqual({
      dmMembers: { from: true, to: false },
      appealText: { from: null, to: "DM @Mods" },
    });
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "watch",
        patch: { dmMembers: false },
        ...taner,
      }),
    ).toEqual({ ok: false, reason: "unchanged" });
  });

  it("ignores fields outside the whitelist, like anti-nuke", async () => {
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "gatehouse",
      patch: { antiNukeEnabled: false, antiNukeTrustedIds: ["attacker"], raidJoinCount: 6 },
      ...taner,
    });
    expect(r.ok && Object.keys(r.change.changes)).toEqual(["raidJoinCount"]);
    await exec("RESET ROLE");
    const g = await getGatehouseSettings(db, G);
    await exec("SET ROLE garrison_web");
    expect(g).toMatchObject({ antiNukeEnabled: true, antiNukeTrustedIds: [], raidJoinCount: 6 });
  });

  it("refuses anti-nuke changes at the database level too", async () => {
    await denied(db.update(gatehouseSettings).set({ antiNukeEnabled: false }));
    await denied(db.update(gatehouseSettings).set({ antiNukeTrustedIds: ["attacker"] }));
  });

  it("undoes once, and refuses when someone changed it since", async () => {
    const first = await applySettingsChange(db, {
      guildId: G,
      module: "gatehouse",
      patch: { raidWindowSeconds: 45 },
      ...taner,
    });
    const id = first.ok ? first.change.id : "";
    const undo = await undoSettingsChange(db, G, id, kel);
    expect(undo.ok && undo.change).toMatchObject({
      revertsChangeId: id,
      changes: { raidWindowSeconds: { from: 45, to: 30 } },
      username: "kel",
    });
    expect(await undoSettingsChange(db, G, id, kel)).toEqual({
      ok: false,
      reason: "already_undone",
    });
    expect(await undoSettingsChange(db, G, undo.ok ? undo.change.id : "", kel)).toEqual({
      ok: false,
      reason: "is_undo",
    });

    const a = await applySettingsChange(db, {
      guildId: G,
      module: "gatehouse",
      patch: { autoUnlockMinutes: 30 },
      ...taner,
    });
    await applySettingsChange(db, {
      guildId: G,
      module: "gatehouse",
      patch: { autoUnlockMinutes: 60 },
      ...kel,
    });
    expect(await undoSettingsChange(db, G, a.ok ? a.change.id : "", taner)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("won't undo another server's change", async () => {
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "watch",
      patch: { dmMembers: true },
      ...taner,
    });
    expect(await undoSettingsChange(db, "other", r.ok ? r.change.id : "", taner)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("creates the ops row on first edit", async () => {
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "ops",
        patch: { timezone: "America/Chicago" },
        ...taner,
      }),
    ).toMatchObject({ ok: true });
  });

  it("edits Ranks and Ledger, creating their rows on first edit", async () => {
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "ranks",
        patch: { enabled: true, announce: "channel", announceChannelId: "123456789012345678" },
        ...taner,
      }),
    ).toMatchObject({ ok: true, change: { changes: { enabled: { from: false, to: true } } } });
    const ledger = await applySettingsChange(db, {
      guildId: G,
      module: "ledger",
      patch: { retentionDays: 90 },
      ...taner,
    });
    expect(ledger).toMatchObject({
      ok: true,
      change: { changes: { retentionDays: { from: 30, to: 90 } } },
    });
    if (!ledger.ok) throw new Error("unreachable");
    expect(await undoSettingsChange(db, G, ledger.change.id, kel)).toMatchObject({ ok: true });
  });

  it("holds Ledger retention to 7..365 days, keeps XP bot-only, and bounds reward levels", async () => {
    const tooShort = await applySettingsChange(db, {
      guildId: G,
      module: "ledger",
      patch: { retentionDays: 1 },
      ...taner,
    }).then(
      () => "",
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(tooShort).toMatch(/ledger_retention_range/);
    await denied(db.update(memberXp).set({ xp: 999999 }));
    // Rewards are dashboard-editable now, but only within the levels /ranks allows.
    const outOfRange = await Promise.resolve(
      db.insert(rankRewards).values({ guildId: G, level: 9999, roleId: "1" }),
    ).then(
      () => "",
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(outOfRange).toMatch(/rank_rewards_level/);
    await denied(db.delete(ledgerSettings));
  });

  it("replaces the escalation ladder as one change, switching removed steps off", async () => {
    const ladder = [
      { warnCount: 5, windowMinutes: 10080, action: "ban" as const, durationSeconds: null },
      { warnCount: 2, windowMinutes: 1440, action: "timeout" as const, durationSeconds: 600 },
    ];
    const res = await applySettingsChange(db, {
      guildId: G,
      module: "escalation",
      patch: { rules: ladder },
      ...taner,
    });
    expect(res).toMatchObject({ ok: true });
    const now = await listEscalationRules(db, G);
    expect(now.map((r) => [r.warnCount, r.action])).toEqual([
      [2, "timeout"],
      [5, "ban"],
    ]);
    // Same ladder in another order is no change.
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "escalation",
        patch: { rules: [...ladder].reverse() },
        ...taner,
      }),
    ).toEqual({ ok: false, reason: "unchanged" });
    if (!res.ok) throw new Error("unreachable");
    expect(await undoSettingsChange(db, G, res.change.id, kel)).toMatchObject({ ok: true });
    expect((await listEscalationRules(db, G)).map((r) => r.warnCount)).toEqual([3]);
  });

  it("bounds ladder values in the database and never deletes a rule", async () => {
    const bad = await applySettingsChange(db, {
      guildId: G,
      module: "escalation",
      patch: {
        rules: [{ warnCount: 4, windowMinutes: 60, action: "timeout", durationSeconds: 99999999 }],
      },
      ...taner,
    }).then(
      () => "",
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(bad).toMatch(/escalation_duration/);
    await denied(db.delete(escalationRules));
    await denied(db.update(escalationRules).set({ guildId: "961" }));
  });

  it("edits Gatehouse staff roles and verification, but never anti-nuke", async () => {
    const res = await applySettingsChange(db, {
      guildId: G,
      module: "gatehouse",
      patch: {
        staffRoleIds: ["100000000000000001"],
        verifyRoleId: "100000000000000002",
        verifyMinAccountAgeDays: 7,
      },
      ...taner,
    });
    expect(res).toMatchObject({ ok: true });
    const bad = await applySettingsChange(db, {
      guildId: G,
      module: "gatehouse",
      patch: { verifyMinAccountAgeDays: 9999 },
      ...taner,
    }).then(
      () => "",
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(bad).toMatch(/gatehouse_verify_age/);
  });

  it("replaces level rewards as one list, with undo", async () => {
    const rewards = [
      { level: 20, roleId: "100000000000000020" },
      { level: 5, roleId: "100000000000000005" },
    ];
    const res = await applySettingsChange(db, {
      guildId: G,
      module: "rewards",
      patch: { rewards },
      ...taner,
    });
    expect(res).toMatchObject({ ok: true });
    const next = await applySettingsChange(db, {
      guildId: G,
      module: "rewards",
      patch: { rewards: [{ level: 5, roleId: "100000000000000005" }] },
      ...taner,
    });
    expect(next).toMatchObject({
      ok: true,
      change: { changes: { rewards: { to: [{ level: 5 }] } } },
    });
    if (!next.ok) throw new Error("unreachable");
    expect(await undoSettingsChange(db, G, next.change.id, kel)).toMatchObject({ ok: true });
    await denied(db.delete(rankRewards));
  });

  it("keeps history append-only", async () => {
    expect((await listSettingsChanges(db, G)).length).toBeGreaterThan(5);
    await denied(db.update(settingsChanges).set({ username: "someone else" }));
    await denied(db.delete(settingsChanges));
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    await denied(db.select().from(settingsChanges));
    expect((await getWatchSettings(db, G)).dmMembers).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
  });
});
