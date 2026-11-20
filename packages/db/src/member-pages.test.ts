import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange, getMemberPages, undoSettingsChange } from "./repo/settings";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000001";
const owner = { userId: "100000000000000001", username: "owner" };

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Ironhold" });
  await exec("RESET ROLE");
  await exec("SET ROLE garrison_web");
});
afterAll(() => close());

describe("member pages, as garrison_web", () => {
  it("shows You and hides Your record until an owner says otherwise", async () => {
    expect(await getMemberPages(db, G)).toMatchObject({ showYou: true, showRecord: false });
  });

  it("saves the switches with history, and undo puts them back", async () => {
    const on = await applySettingsChange(db, {
      guildId: G,
      module: "members",
      patch: { showYou: true, showRecord: true },
      ...owner,
    });
    expect(on).toMatchObject({ ok: true, change: { module: "members" } });
    if (!on.ok) return;
    expect(on.change.changes).toEqual({ showRecord: { from: false, to: true } });
    expect(await getMemberPages(db, G)).toMatchObject({ showYou: true, showRecord: true });

    const back = await undoSettingsChange(db, G, on.change.id, owner, []);
    expect(back.ok).toBe(true);
    expect(await getMemberPages(db, G)).toMatchObject({ showYou: true, showRecord: false });
  });

  it("lets only a manager undo it when told to (as for access)", async () => {
    const off = await applySettingsChange(db, {
      guildId: G,
      module: "members",
      patch: { showYou: false, showRecord: false },
      ...owner,
    });
    if (!off.ok) throw new Error("save failed");
    const refused = await undoSettingsChange(db, G, off.change.id, owner, ["access", "members"]);
    expect(refused.ok).toBe(false);
    expect(await getMemberPages(db, G)).toMatchObject({ showYou: false, showRecord: false });
  });
});

describe("member pages, as garrison_bot", () => {
  it("can't read them: they're the dashboard's alone", async () => {
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    await expect(getMemberPages(db, G)).rejects.toThrow();
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
  });
});
