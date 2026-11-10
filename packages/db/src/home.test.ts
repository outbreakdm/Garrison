import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { getSetupFacts } from "./repo/home";
import { createOpsEvent } from "./repo/ops";
import { applySettingsChange, undoSettingsChange } from "./repo/settings";
import { dashboardSettings } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960";
const taner = { userId: "1", username: "taner" };

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
});
afterAll(() => close());

describe("setup facts, as garrison_web", () => {
  it("starts with nothing set up, and reads without creating rows", async () => {
    await exec("SET ROLE garrison_web");
    expect(await getSetupFacts(db, G)).toEqual({
      logChannelId: null,
      antiRaidEnabled: true,
      alertChannelId: null,
      verifyRoleId: null,
      ranksDecided: false,
      ranksEnabled: false,
      rallyUsed: false,
      setupDismissed: false,
    });
    expect(await db.select().from(dashboardSettings)).toEqual([]);
    await exec("RESET ROLE");
  });

  it("sees settings saved from the dashboard", async () => {
    await exec("SET ROLE garrison_web");
    const save = (module: "watch" | "gatehouse" | "ranks", patch: Record<string, unknown>) =>
      applySettingsChange(db, { guildId: G, module, patch, ...taner });
    await save("watch", { logChannelId: "100000000000000001" });
    await save("gatehouse", { verifyRoleId: "200000000000000002" });
    // Saving Ranks "off" when it's already off changes nothing, but it was decided.
    expect(await save("ranks", { enabled: false })).toEqual({ ok: false, reason: "unchanged" });
    const facts = await getSetupFacts(db, G);
    expect(facts).toMatchObject({
      logChannelId: "100000000000000001",
      verifyRoleId: "200000000000000002",
      ranksDecided: true,
      ranksEnabled: false,
      rallyUsed: false,
    });
    await exec("RESET ROLE");
  });

  it("counts Rally as used once a raid exists", async () => {
    await exec("SET ROLE garrison_bot");
    await createOpsEvent(db, {
      guildId: G,
      channelId: "c",
      hostId: "h",
      title: "Molten Core",
      note: null,
      slots: [{ name: "Tank", count: 2 }],
      startsAt: new Date(Date.now() + 86_400_000),
      timezone: "UTC",
      repeatWeekly: false,
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect((await getSetupFacts(db, G)).rallyUsed).toBe(true);
    await exec("RESET ROLE");
  });

  it("hides the checklist with history, and undo brings it back", async () => {
    await exec("SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "dashboard",
      patch: { setupDismissed: true, guildId: "999" },
      ...taner,
    });
    expect(r.ok && r.change.changes).toEqual({ setupDismissed: { from: false, to: true } });
    expect((await getSetupFacts(db, G)).setupDismissed).toBe(true);
    if (!r.ok) throw new Error("expected a change");
    expect((await undoSettingsChange(db, G, r.change.id, taner)).ok).toBe(true);
    expect((await getSetupFacts(db, G)).setupDismissed).toBe(false);
    await exec("RESET ROLE");
  });

  it("gives the bot no access to dashboard preferences", async () => {
    await exec("SET ROLE garrison_bot");
    await denied(db.select().from(dashboardSettings));
    await denied(db.insert(dashboardSettings).values({ guildId: G, setupDismissed: true }));
    await exec("RESET ROLE");
  });
});
