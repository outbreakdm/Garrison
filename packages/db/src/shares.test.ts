import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  findInsightsShare,
  getInsightsShare,
  makeInsightsShare,
  newShareToken,
  setInsightsShareEmbed,
  stopInsightsShare,
} from "./repo/shares";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000070";

describe("insights share links", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Ironhold" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("makes long random tokens", () => {
    const a = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newShareToken()).not.toBe(a);
  });

  it("opens by its token; replacing it closes the old one", async () => {
    await exec("SET ROLE garrison_web");
    const first = await makeInsightsShare(db, G, "owner");
    expect(await findInsightsShare(db, first.token)).toMatchObject({ guildId: G, embed: false });
    const second = await makeInsightsShare(db, G, "owner");
    expect(second.token).not.toBe(first.token);
    expect(await findInsightsShare(db, first.token)).toBeNull();
    await setInsightsShareEmbed(db, G, true);
    expect(await getInsightsShare(db, G)).toMatchObject({ embed: true });
    expect(await findInsightsShare(db, "short")).toBeNull();
    await stopInsightsShare(db, G);
    expect(await findInsightsShare(db, second.token)).toBeNull();
    await exec("RESET ROLE");
  });

  it("is the dashboard's alone: the bot can't read share links", async () => {
    await exec("SET ROLE garrison_bot");
    await expect(getInsightsShare(db, G)).rejects.toThrow();
    await exec("RESET ROLE");
  });
});
