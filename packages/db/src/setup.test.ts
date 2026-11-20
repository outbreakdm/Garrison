import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { checkQmSettings, type QmSettingsLookup } from "./qm-settings";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange, readSettings } from "./repo/settings";
import type { SettingsModule } from "./schema";
import {
  protectProposals,
  SETUP_PRESET_KEYS,
  SETUP_PRESETS,
  setupProgress,
  welcomeProposals,
} from "./setup";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await upsertGuild(db, { id: "su1", name: "su1" });
  await exec("SET ROLE garrison_bot");
});
afterAll(() => close());

const TEXT = "111111111111111111";
const lookup: QmSettingsLookup = {
  channel: (id) => (id === TEXT ? "text" : null),
  role: () => null,
  created: () => null,
};

describe("setup in three clicks", () => {
  it("protects a Free server in one click, AI moderation included, and it can be applied", async () => {
    const out = await checkQmSettings(db, "su1", protectProposals(), lookup, entitlements("free"));
    if (!out.ok) throw new Error(out.errors.join(" "));
    // Anti-raid and some automod rules are on by default, so only what's off changes.
    expect(out.changes.map((c) => `${c.module}.${c.field}`)).toEqual(
      expect.arrayContaining(["automod.enabled", "automod.aiEnabled"]),
    );
    expect(out.changes.every((c) => c.module === "automod")).toBe(true);
    for (const module of [...new Set(out.changes.map((c) => c.module))]) {
      const r = await applySettingsChange(db, {
        guildId: "su1",
        module: module as SettingsModule,
        patch: Object.fromEntries(
          out.changes.filter((c) => c.module === module).map((c) => [c.field, c.to]),
        ),
        userId: "1",
        username: "owner",
      });
      expect(r.ok).toBe(true);
    }
    expect(await readSettings(db, "su1", "automod")).toMatchObject({
      enabled: true,
      scamLinks: true,
      invites: true,
      aiEnabled: true,
    });
  });

  it("turns welcome cards on in the channel picked, and only a text channel", async () => {
    const ok = await checkQmSettings(
      db,
      "su1",
      welcomeProposals(TEXT),
      lookup,
      entitlements("free"),
    );
    expect(ok.ok && ok.changes.map((c) => c.field)).toEqual(["joinEnabled", "joinChannelId"]);
    const bad = await checkQmSettings(
      db,
      "su1",
      welcomeProposals("222222222222222222"),
      lookup,
      entitlements("free"),
    );
    expect(bad.ok).toBe(false);
  });

  it("ticks steps off from the server's own settings", () => {
    expect(
      setupProgress({ automodOn: true, antiRaidOn: true, welcomeOn: false, built: false }),
    ).toEqual({ protect: true, welcome: false, build: false });
    expect(
      setupProgress({ automodOn: true, antiRaidOn: false, welcomeOn: true, built: true }).protect,
    ).toBe(false);
  });

  it("has a request written for each kind of server", () => {
    expect(SETUP_PRESET_KEYS).toEqual(["gaming", "creator", "study"]);
    for (const k of SETUP_PRESET_KEYS) {
      expect(SETUP_PRESETS[k].prompt.length).toBeGreaterThan(80);
      expect(SETUP_PRESETS[k].prompt.length).toBeLessThanOrEqual(500);
    }
  });
});
