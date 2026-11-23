import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  countRecentQmBuilds,
  createQmPlan,
  getQmBuild,
  getQmBuildByVersion,
  latestWaitingQmBuild,
  listQmBuilds,
  qmChangesUsed,
  recordQmCreated,
  retireOtherDrafts,
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

describe("drafts have no time limit", () => {
  const W = "981";
  const op = {
    kind: "create_text_channel" as const,
    ref: "c1",
    name: "lfg",
    parent: null,
    topic: null,
    slowmodeSeconds: null,
    userLimit: null,
    privateTo: [],
    color: null,
    hoist: false,
    mentionable: false,
  };
  const draft = (personId: string) =>
    createQmPlan(db, {
      guildId: W,
      requestedById: personId,
      requestedByTag: personId,
      prompt: "p",
      summary: "s",
      plan: [op, { ...op, ref: "c2", name: "raids" }],
      model: "m",
    });

  it("keeps a days-old draft waiting, holding its changes", async () => {
    await upsertGuild(db, { id: W, name: "Longhaul" });
    const old = await draft("7");
    await exec("RESET ROLE");
    await exec(
      `update qm_builds set created_at = now() - interval '3 days' where id = '${old.id}'`,
    );
    await exec("SET ROLE garrison_bot");
    expect((await latestWaitingQmBuild(db, W, "7"))?.id).toBe(old.id);
    const since = new Date(Date.now() - 10 * 86_400_000);
    expect(await qmChangesUsed(db, { guildId: W }, since)).toBe(2);
    // A new draft by the same person doesn't count what it's about to replace.
    expect(
      await qmChangesUsed(db, { guildId: W }, since, {
        exceptDraftsOf: { guildId: W, personId: "7" },
      }),
    ).toBe(0);
  });

  it("retires a person's other drafts on the server once a new one is saved", async () => {
    const mine = await latestWaitingQmBuild(db, W, "7");
    const theirs = await draft("8");
    const next = await draft("7");
    const retired = await retireOtherDrafts(db, W, "7", next.id, next.version);
    expect(retired.map((r) => r.id)).toEqual([mine?.id]);
    expect((await getQmBuild(db, W, mine?.id ?? ""))?.status).toBe("cancelled");
    expect((await getQmBuild(db, W, theirs.id))?.status).toBe("pending");
    expect((await latestWaitingQmBuild(db, W, "7"))?.id).toBe(next.id);
  });
});

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
