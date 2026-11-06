import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createCase } from "./repo/cases";
import { upsertGuild } from "./repo/guilds";
import {
  createWebSession,
  getActiveGuild,
  getOverview,
  getWebSession,
  listActiveGuilds,
  listRecentCases,
  revokeWebSession,
  touchWebSession,
} from "./repo/web";
import { guilds, modCases, webSessions } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;

async function denied(query: PromiseLike<unknown>) {
  const err = await Promise.resolve(query).then(
    () => null,
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
  expect(err, "should be refused").toMatch(/permission denied/);
}

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  // Seed as the bot, then switch to the dashboard role.
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: "900", name: "Scapewatch" });
  await upsertGuild(db, { id: "901", name: "Other" });
  await createCase(db, {
    guildId: "900",
    action: "warn",
    targetId: "7",
    moderatorId: "1",
    moderatorTag: "taner",
  });
  await denied(db.select().from(webSessions));
  await exec("RESET ROLE");
  await exec("SET ROLE garrison_web");
});
afterAll(() => close());

describe("garrison_web", () => {
  it("runs the session lifecycle", async () => {
    const future = new Date(Date.now() + 86_400_000);
    await createWebSession(db, {
      tokenHash: "h1",
      userId: "u",
      username: "taner",
      manageableGuildIds: ["900"],
      expiresAt: future,
    });
    expect((await getWebSession(db, "h1"))?.manageableGuildIds).toEqual(["900"]);
    await touchWebSession(db, "h1");
    await revokeWebSession(db, "h1");
    expect(await getWebSession(db, "h1")).toBeNull();

    await createWebSession(db, {
      tokenHash: "h2",
      userId: "u",
      username: "taner",
      manageableGuildIds: [],
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await getWebSession(db, "h2")).toBeNull();
  });

  it("reads dashboard data", async () => {
    expect((await listActiveGuilds(db, ["900", "nope"])).map((g) => g.id)).toEqual(["900"]);
    expect(await getActiveGuild(db, "900")).toMatchObject({ name: "Scapewatch" });
    expect(await getOverview(db, "900")).toMatchObject({
      modActions24h: 1,
      openGroups: 0,
      activeLockdown: null,
    });
    expect(await listRecentCases(db, "900")).toHaveLength(1);
  });

  it("can't write module data or rewrite sessions", async () => {
    await denied(
      db.insert(modCases).values({
        guildId: "900",
        caseNumber: 99,
        action: "ban",
        moderatorId: "x",
        moderatorTag: "x",
      }),
    );
    await denied(db.update(guilds).set({ name: "pwned" }));
    await denied(db.delete(modCases));
    await denied(db.update(webSessions).set({ userId: "someone-else" }));
    await denied(db.delete(webSessions));
  });
});
