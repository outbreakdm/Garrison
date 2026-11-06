import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./client.js";
import {
  countActiveWarnings,
  createCase,
  getCase,
  listCasesForTarget,
  revokeCase,
} from "./repo/cases.js";
import {
  getWatchSettings,
  listEscalationRules,
  updateWatchSettings,
  upsertGuild,
} from "./repo/guilds.js";
import { createTestDb } from "./testing.js";

const GUILD = { id: "100", name: "Scapewatch" };
const mod = { moderatorId: "1", moderatorTag: "taner" };

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await upsertGuild(db, GUILD);
});
afterEach(() => close());

describe("guilds", () => {
  it("seeds settings and the default escalation rule on first join only", async () => {
    expect(await upsertGuild(db, { ...GUILD, name: "Renamed" })).toEqual({ created: false });
    const settings = await getWatchSettings(db, GUILD.id);
    expect(settings.dmMembers).toBe(true);
    const rules = await listEscalationRules(db, GUILD.id);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ warnCount: 3, windowMinutes: 1440, action: "timeout" });
  });

  it("updates Watch settings", async () => {
    const row = await updateWatchSettings(db, GUILD.id, { logChannelId: "555", dmMembers: false });
    expect(row).toMatchObject({ logChannelId: "555", dmMembers: false });
  });
});

describe("cases", () => {
  it("numbers cases per guild, starting at 1", async () => {
    await upsertGuild(db, { id: "200", name: "Other" });
    const a = await createCase(db, { guildId: GUILD.id, action: "warn", targetId: "9", ...mod });
    const b = await createCase(db, { guildId: GUILD.id, action: "ban", targetId: "9", ...mod });
    const c = await createCase(db, { guildId: "200", action: "warn", targetId: "9", ...mod });
    expect([a.caseNumber, b.caseNumber, c.caseNumber]).toEqual([1, 2, 1]);
    expect((await getCase(db, GUILD.id, 2))?.action).toBe("ban");
  });

  it("gives unique numbers to cases created at the same time", async () => {
    const made = await Promise.all(
      Array.from({ length: 10 }, () =>
        createCase(db, { guildId: GUILD.id, action: "warn", targetId: "9", ...mod }),
      ),
    );
    expect(new Set(made.map((c) => c.caseNumber)).size).toBe(10);
  });

  it("refuses cases for unknown guilds", async () => {
    await expect(
      createCase(db, { guildId: "nope", action: "warn", targetId: "9", ...mod }),
    ).rejects.toThrow(/not registered/);
  });

  it("counts only active warnings inside the window", async () => {
    const since = new Date(Date.now() - 60_000);
    const w1 = await createCase(db, { guildId: GUILD.id, action: "warn", targetId: "9", ...mod });
    await createCase(db, { guildId: GUILD.id, action: "warn", targetId: "9", ...mod });
    await createCase(db, { guildId: GUILD.id, action: "timeout", targetId: "9", ...mod });
    await createCase(db, { guildId: GUILD.id, action: "warn", targetId: "8", ...mod });
    expect(await countActiveWarnings(db, GUILD.id, "9", since)).toBe(2);

    await revokeCase(db, GUILD.id, w1.caseNumber, "1");
    expect(await countActiveWarnings(db, GUILD.id, "9", since)).toBe(1);
    expect(await countActiveWarnings(db, GUILD.id, "9", new Date(Date.now() + 60_000))).toBe(0);
  });

  it("revokes a case once", async () => {
    const c = await createCase(db, { guildId: GUILD.id, action: "warn", targetId: "9", ...mod });
    expect((await revokeCase(db, GUILD.id, c.caseNumber, "1"))?.revokedById).toBe("1");
    expect(await revokeCase(db, GUILD.id, c.caseNumber, "1")).toBeNull();
    expect(await revokeCase(db, GUILD.id, 999, "1")).toBeNull();
  });

  it("lists a member's history newest first", async () => {
    for (const action of ["warn", "timeout", "ban"] as const) {
      await createCase(db, { guildId: GUILD.id, action, targetId: "9", ...mod });
    }
    const history = await listCasesForTarget(db, GUILD.id, "9", 2);
    expect(history.map((c) => c.action)).toEqual(["ban", "timeout"]);
  });
});
