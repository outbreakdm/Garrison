import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { EDITABLE_FIELDS, readSettings } from "./repo/settings";
import type { SettingsModule } from "./schema";
import { suggestionSettings } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await upsertGuild(db, { id: "r1", name: "r1" });
  await db
    .insert(suggestionSettings)
    .values({ guildId: "r1", enabled: true, channelId: "123456789012345678" });
  // The AI assistant's chat reads as the bot.
  await exec("SET ROLE garrison_bot");
});
afterAll(() => close());

describe("readSettings", () => {
  it("reads only the editable fields of a module that's set up", async () => {
    expect(await readSettings(db, "r1", "suggestions")).toEqual({
      enabled: true,
      channelId: "123456789012345678",
      anonymous: false,
    });
  });

  it("is null for modules never set up, and the bot can read every module but member pages", async () => {
    // Moderation (with its default warning ladder) and Security come with the server.
    const made = new Set<SettingsModule>(["suggestions", "watch", "gatehouse", "escalation"]);
    for (const m of Object.keys(EDITABLE_FIELDS) as SettingsModule[]) {
      if (m === "members") continue;
      expect(await readSettings(db, "r1", m), m).toEqual(made.has(m) ? expect.any(Object) : null);
    }
    // Which member pages show is the dashboard's alone: the bot has no grant on it.
    await expect(readSettings(db, "r1", "members")).rejects.toThrow();
  });
});
