import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  countRecentQmBuilds,
  createQmPlan,
  getQmBuild,
  getQmBuildByVersion,
  listQmBuilds,
  recordQmCreated,
  transitionQmBuild,
} from "./repo/quartermaster";
import { qmBuilds } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "980";
const plan = (prompt: string) =>
  createQmPlan(db, {
    guildId: G,
    requestedById: "1",
    requestedByTag: "taner",
    prompt,
    summary: "s",
    plan: [],
    model: "m",
  });

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

describe("quartermaster builds, as garrison_bot", () => {
  it("numbers versions per server, even when plans race", async () => {
    const made = await Promise.all([plan("a"), plan("b"), plan("c")]);
    expect(made.map((b) => b.version).sort()).toEqual([1, 2, 3]);
    expect((await getQmBuildByVersion(db, G, 2))?.status).toBe("pending");
    expect(await countRecentQmBuilds(db, G, new Date(Date.now() - 3_600_000))).toBe(3);
  });

  it("moves through states only from the expected one", async () => {
    const b = await plan("d");
    expect(
      await transitionQmBuild(db, b.id, "pending", "applied", { appliedAt: new Date() }),
    ).toMatchObject({ status: "applied" });
    expect(await transitionQmBuild(db, b.id, "pending", "cancelled")).toBeNull();
    expect(
      await transitionQmBuild(db, b.id, "applied", "rolled_back", {
        rolledBackById: "2",
        rolledBackAt: new Date(),
      }),
    ).toMatchObject({ status: "rolled_back" });
  });

  it("records created objects one at a time", async () => {
    const b = await plan("e");
    await recordQmCreated(db, b.id, { kind: "category", id: "c1", name: "WARDOGS" });
    await recordQmCreated(db, b.id, { kind: "channel", id: "ch1", name: "ranked-lfg" });
    expect((await getQmBuild(db, G, b.id))?.created.map((c) => c.id)).toEqual(["c1", "ch1"]);
    expect((await listQmBuilds(db, G))[0]?.version).toBe(5);
  });

  it("can't rewrite a plan, its prompt or who asked", async () => {
    for (const set of [{ plan: [] }, { prompt: "x" }, { requestedById: "x" }]) {
      const err = await db
        .update(qmBuilds)
        .set(set)
        .then(
          () => null,
          (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message}`,
        );
      expect(err).toMatch(/permission denied/);
    }
  });
});
