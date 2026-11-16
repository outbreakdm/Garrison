import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  getServerStats,
  listStatChannels,
  listStatsGuilds,
  removeStatChannels,
  saveStatChannel,
} from "./repo/stats";
import {
  checkServerStats,
  DEFAULT_SERVER_STATS,
  needsMemberList,
  readServerStats,
  statName,
  statNumber,
} from "./server-stats";
import { createTestDb } from "./testing";

const ROLE = "310000000000000001";
const CH = "310000000000000002";
const free = entitlements("free");
const pro = entitlements("pro");
const counter = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, ...extra });

describe("server stats rules", () => {
  it("fills names in, with grouped numbers and the role's name", () => {
    expect(statNumber(372)).toBe("372");
    expect(statNumber(1234567)).toBe("1,234,567");
    expect(statName("Members: {count}", 372)).toBe("Members: 372");
    expect(statName("{role}: {count}", 8, "Staff")).toBe("Staff: 8");
    expect(statName("Members: {count}", null)).toBe("Members: …");
    expect(statName("{count}".repeat(40), 99999).length).toBeLessThanOrEqual(100);
  });

  it("gives each counter a key and the standard name when none is typed", () => {
    const r = checkServerStats(
      { enabled: true, counters: [counter("members"), counter("bots", { template: "" })] },
      free,
      DEFAULT_SERVER_STATS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.counters.map((c) => c.template)).toEqual(["Members: {count}", "Bots: {count}"]);
    expect(r.value.counters[0]?.key).toMatch(/^[a-z0-9]{8}$/);
    expect(new Set(r.value.counters.map((c) => c.key)).size).toBe(2);
  });

  it("keeps a key it's given, so the bot renames the same channel", () => {
    const r = checkServerStats(
      { enabled: true, counters: [counter("members", { key: "abcdef12" })] },
      free,
      DEFAULT_SERVER_STATS,
    );
    expect(r).toMatchObject({ ok: true, value: { counters: [{ key: "abcdef12" }] } });
  });

  it("needs {count}, a role for role counters, and its own channel each", () => {
    const bad = [
      [counter("members", { template: "Members" })],
      [counter("role")],
      [counter("nope")],
      [counter("members", { channelId: CH }), counter("bots", { channelId: CH })],
      [counter("members", { template: "x{count}".repeat(20) })],
    ];
    for (const counters of bad)
      expect(
        checkServerStats({ counters }, pro, DEFAULT_SERVER_STATS).ok,
        JSON.stringify(counters),
      ).toBe(false);
    expect(
      checkServerStats(
        { counters: [counter("role", { roleId: ROLE, template: "{role}: {count}" })] },
        pro,
        DEFAULT_SERVER_STATS,
      ),
    ).toMatchObject({ ok: true, value: { counters: [{ roleId: ROLE }] } });
  });

  it("needs a counter to switch on", () => {
    expect(checkServerStats({ enabled: true, counters: [] }, pro, DEFAULT_SERVER_STATS).ok).toBe(
      false,
    );
  });

  it("holds Free to three counters, and lets a server back on Free keep what it had", () => {
    const four = ["members", "humans", "bots", "boosts"].map((k) => counter(k));
    expect(checkServerStats({ counters: four }, free, DEFAULT_SERVER_STATS).ok).toBe(false);
    const saved = checkServerStats({ counters: four }, pro, DEFAULT_SERVER_STATS);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(checkServerStats({ counters: saved.value.counters }, free, saved.value).ok).toBe(true);
    expect(
      checkServerStats({ counters: [...saved.value.counters, counter("roles")] }, free, saved.value)
        .ok,
    ).toBe(false);
  });

  it("reads stored rows leniently", () => {
    expect(
      readServerStats({
        enabled: true,
        counters: [
          { key: "abcdef12", kind: "members", template: "M {count}" },
          { key: "bad key", kind: "members" },
          { key: "abcdef13", kind: "role" },
          "junk",
        ],
        categoryId: "x",
      }),
    ).toEqual({
      enabled: true,
      counters: [
        { key: "abcdef12", kind: "members", roleId: null, template: "M {count}", channelId: null },
      ],
      categoryId: null,
    });
  });

  it("knows which counters need the member list", () => {
    expect(needsMemberList(readServerStats(null).counters)).toBe(false);
    expect(
      needsMemberList([
        { key: "a1b2c3", kind: "bots", roleId: null, template: "", channelId: null },
      ]),
    ).toBe(true);
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000066";
const owner = { userId: "100000000000000001", username: "owner" };

describe("server stats, in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Ironhold" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("the dashboard saves counters with history, and the bot reads them", async () => {
    await exec("SET ROLE garrison_web");
    const checked = checkServerStats(
      { enabled: true, counters: [counter("members")] },
      free,
      DEFAULT_SERVER_STATS,
    );
    if (!checked.ok) throw new Error(checked.error);
    const saved = await applySettingsChange(db, {
      guildId: G,
      module: "stats",
      patch: { ...checked.value },
      ...owner,
    });
    expect(saved).toMatchObject({ ok: true, change: { module: "stats" } });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await getServerStats(db, G)).toMatchObject({
      enabled: true,
      counters: [{ kind: "members" }],
    });
    expect(await listStatsGuilds(db, [G, "960000000000000099"])).toEqual([G]);
    await exec("RESET ROLE");
  });

  it("the bot keeps the channel record; the dashboard only reads it", async () => {
    await exec("SET ROLE garrison_bot");
    await saveStatChannel(db, {
      guildId: G,
      counterKey: "abcdef12",
      channelId: CH,
      made: true,
      name: "Members: 3",
      count: 3,
      renamed: true,
    });
    await saveStatChannel(db, {
      guildId: G,
      counterKey: "abcdef12",
      channelId: CH,
      made: true,
      name: "Members: 4",
      count: 4,
      renamed: true,
    });
    expect(await listStatChannels(db, G)).toMatchObject([{ name: "Members: 4", count: 4 }]);
    await exec("RESET ROLE");

    await exec("SET ROLE garrison_web");
    expect(await listStatChannels(db, G)).toHaveLength(1);
    await expect(
      saveStatChannel(db, {
        guildId: G,
        counterKey: "zzzzzz99",
        channelId: CH,
        made: true,
        name: "x",
        count: 1,
        renamed: true,
      }),
    ).rejects.toThrow();
    await expect(removeStatChannels(db, G, ["abcdef12"])).rejects.toThrow();
    await exec("RESET ROLE");

    await exec("SET ROLE garrison_bot");
    await removeStatChannels(db, G, ["abcdef12"]);
    expect(await listStatChannels(db, G)).toEqual([]);
    await exec("RESET ROLE");
  });

  it("the bot can't change the counters", async () => {
    await exec("SET ROLE garrison_bot");
    await expect(
      applySettingsChange(db, {
        guildId: G,
        module: "stats",
        patch: { enabled: false },
        ...owner,
      }),
    ).rejects.toThrow();
    await exec("RESET ROLE");
  });
});
