import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  addMemberNote,
  appealBlock,
  createAppeal,
  decideAppeal,
  listAppeals,
  listAppealsForUser,
  listMemberNotes,
  removeMemberNote,
} from "./repo/notes";
import { appeals } from "./schema";
import { createTestDb } from "./testing";

describe("appeal limits", () => {
  it("allows one open appeal, and a week's wait after a denial", () => {
    const now = new Date("2026-11-12T00:00:00Z");
    expect(appealBlock([], now)).toBeNull();
    expect(appealBlock([{ status: "open", decidedAt: null }], now)).toBe("open");
    expect(
      appealBlock([{ status: "denied", decidedAt: new Date("2026-11-10T00:00:00Z") }], now),
    ).toBe("cooldown");
    expect(
      appealBlock([{ status: "denied", decidedAt: new Date("2026-11-01T00:00:00Z") }], now),
    ).toBeNull();
  });
});

describe("notes and appeals, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "999";
  const U = "100000000000000001";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("lets the bot and dashboard add notes, and only the dashboard remove them", async () => {
    await exec("SET ROLE garrison_bot");
    await addMemberNote(db, {
      guildId: G,
      userId: U,
      authorId: "1",
      authorName: "mod",
      body: "From /note",
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    const n = await addMemberNote(db, {
      guildId: G,
      userId: U,
      authorId: "2",
      authorName: "taner",
      body: "From the dashboard",
    });
    expect((await listMemberNotes(db, G, U)).map((x) => x.body)).toEqual([
      "From the dashboard",
      "From /note",
    ]);
    expect(await removeMemberNote(db, G, n.id, "2")).toBe(true);
    expect(await removeMemberNote(db, G, n.id, "2")).toBe(false);
    expect(await listMemberNotes(db, G, U)).toHaveLength(1);
    await exec("RESET ROLE");
  });

  it("takes appeals from the page and decisions from the dashboard, once", async () => {
    await exec("SET ROLE garrison_web");
    const a = await createAppeal(db, {
      guildId: G,
      userId: U,
      username: "rook",
      caseNumber: 4,
      body: "I was banned by mistake during the raid cleanup.",
    });
    expect((await listAppeals(db, G)).open).toHaveLength(1);
    const reviewer = { id: "2", name: "taner" };
    expect(
      await decideAppeal(db, {
        guildId: G,
        id: a.id,
        status: "accepted",
        response: "Sorry!",
        reviewer,
      }),
    ).not.toBeNull();
    expect(
      await decideAppeal(db, { guildId: G, id: a.id, status: "denied", response: null, reviewer }),
    ).toBeNull();
    expect((await listAppealsForUser(db, G, U))[0]).toMatchObject({
      status: "accepted",
      response: "Sorry!",
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    // The bot never touches appeals.
    const err = await Promise.resolve(db.select().from(appeals)).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});
