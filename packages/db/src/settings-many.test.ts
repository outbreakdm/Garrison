import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { EDITABLE_FIELDS, readManySettings, readSettings } from "./repo/settings";
import type { SettingsModule } from "./schema";
import { starboardSettings, suggestionSettings, voiceSettings } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await upsertGuild(db, { id: "m1", name: "m1" });
  await db
    .insert(suggestionSettings)
    .values({ guildId: "m1", enabled: true, channelId: "123456789012345678" });
  await db.insert(starboardSettings).values({ guildId: "m1", enabled: true, threshold: 4 });
  await db.insert(voiceSettings).values({ guildId: "m1", enabled: false });
  // The dashboard reads these for its menu.
  await exec("SET ROLE garrison_web");
});
afterAll(() => close());

const ALL = Object.keys(EDITABLE_FIELDS) as SettingsModule[];

describe("readManySettings", () => {
  it("gives every module exactly what readSettings gives it, in one go", async () => {
    const many = await readManySettings(db, "m1", ALL);
    for (const m of ALL) expect(many.get(m), m).toEqual(await readSettings(db, "m1", m));
    expect(many.get("suggestions")).toEqual({
      enabled: true,
      channelId: "123456789012345678",
      anonymous: false,
      // The panel and its form (0092), unset: the standard ones.
      panelTitle: null,
      panelBody: null,
      buttonLabel: null,
      questions: null,
      panelSticky: true,
    });
  });

  it("falls back to one read per module for a server it has no row for", async () => {
    const many = await readManySettings(db, "nowhere", ["suggestions", "watch", "rewards"]);
    expect([...many.keys()].sort()).toEqual(["rewards", "suggestions", "watch"]);
    for (const [m, v] of many) expect(v, m).toEqual(await readSettings(db, "nowhere", m));
  });
});
