import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  dueTempRoles,
  getStickyPost,
  getUtilitySettings,
  pruneRoleSnapshots,
  saveRoleSnapshot,
  setStickyPost,
  setTimedRole,
  takeRoleSnapshot,
} from "./repo/utilities";
import { timedRoles } from "./schema";
import { createTestDb } from "./testing";
import {
  activeStickies,
  checkClearRules,
  checkStickies,
  parseDuration,
  readStickies,
  type Sticky,
} from "./utilities";

const free = entitlements("free");
const pro = entitlements("pro");
const sticky = (i: number, over: Partial<Sticky> = {}): Sticky => ({
  id: `stick${i}x`,
  channelId: `10000000000000000${i}`,
  text: "Read the rules first.",
  enabled: true,
  ...over,
});

describe("utilities", () => {
  it("keeps Free to one sticky, unless it already had more", () => {
    expect(checkStickies([sticky(1)], free).ok).toBe(true);
    expect(checkStickies([sticky(1), sticky(2)], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Free servers can have 1 sticky message/),
    });
    expect(checkStickies([sticky(1), sticky(2)], free, [sticky(1), sticky(2)]).ok).toBe(true);
    expect(checkStickies([sticky(1), sticky(2)], pro).ok).toBe(true);
    // Past the limit, the extra ones pause.
    expect(activeStickies([sticky(1), sticky(2)], free).map((s) => s.id)).toEqual(["stick1x"]);
  });

  it("refuses two in one channel, empty text and pings", () => {
    expect(checkStickies([sticky(1), sticky(1, { id: "other1" })], pro)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/one sticky/),
    });
    expect(checkStickies([sticky(1, { text: " " })], pro).ok).toBe(false);
    expect(checkStickies([sticky(1, { text: "hey @everyone" })], pro).ok).toBe(false);
    expect(readStickies([sticky(1), { id: "bad" }])).toHaveLength(1);
  });

  it("clears after 1 hour to 14 days", () => {
    const rule = (hours: number) => [
      { id: "clear1", channelId: "100000000000000001", hours, keepPinned: true, enabled: true },
    ];
    expect(checkClearRules(rule(24), free).ok).toBe(true);
    expect(checkClearRules(rule(0), free).ok).toBe(false);
    expect(checkClearRules(rule(14 * 24 + 1), free).ok).toBe(false);
  });

  it("reads times like 30m, 2h, 3d, 1w and 1d 12h", () => {
    expect(parseDuration("30m")).toBe(30 * 60_000);
    expect(parseDuration("2h")).toBe(2 * 3_600_000);
    expect(parseDuration("1d 12h")).toBe(36 * 3_600_000);
    expect(parseDuration("1w")).toBe(7 * 86_400_000);
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("2h banana")).toBeNull();
    expect(parseDuration("30s")).toBeNull();
    expect(parseDuration("400d")).toBeNull();
  });
});

describe("utilities storage", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "997";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("saves from the dashboard with history", async () => {
    await exec("SET ROLE garrison_web");
    const out = await applySettingsChange(db, {
      guildId: G,
      module: "utilities",
      patch: { restoreRoles: true, stickies: [sticky(1)] },
      userId: "1",
      username: "taner",
    });
    expect(out.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    const s = await getUtilitySettings(db, G);
    expect(s.restoreRoles).toBe(true);
    expect(readStickies(s.stickies)).toHaveLength(1);
    await exec("RESET ROLE");
  });

  it("gives roles back once, and forgets them after 180 days", async () => {
    await exec("SET ROLE garrison_bot");
    await saveRoleSnapshot(db, { guildId: G, userId: "u1", roleIds: ["r1", "r2"] });
    await saveRoleSnapshot(db, { guildId: G, userId: "u1", roleIds: ["r3"] });
    expect(await takeRoleSnapshot(db, G, "u1")).toEqual(["r3"]);
    expect(await takeRoleSnapshot(db, G, "u1")).toEqual([]);
    const long = new Date(Date.now() - 200 * 86_400_000);
    await saveRoleSnapshot(db, { guildId: G, userId: "u2", roleIds: ["r1"] }, long);
    expect(await pruneRoleSnapshots(db)).toBe(1);
    await exec("RESET ROLE");
  });

  it("moves a timed role's end instead of giving it twice, and lists the due ones", async () => {
    await exec("SET ROLE garrison_bot");
    const past = new Date(Date.now() - 1000);
    const a = await setTimedRole(db, {
      guildId: G,
      userId: "u1",
      roleId: "r1",
      expiresAt: new Date(Date.now() + 60_000),
      givenBy: "m",
    });
    const b = await setTimedRole(db, {
      guildId: G,
      userId: "u1",
      roleId: "r1",
      expiresAt: past,
      givenBy: "m2",
    });
    expect(b.id).toBe(a.id);
    expect((await dueTempRoles(db)).map((r) => r.givenBy)).toEqual(["m2"]);
    await setStickyPost(db, { guildId: G, channelId: "c1", messageId: "m1" });
    await setStickyPost(db, { guildId: G, channelId: "c1", messageId: "m2" });
    expect((await getStickyPost(db, "c1"))?.messageId).toBe("m2");
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    const err = await Promise.resolve(db.delete(timedRoles)).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});
