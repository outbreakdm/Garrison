import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  getRoster,
  listLinks,
  listSharesForUser,
  removeLink,
  removeProviderLinks,
  setRosterShare,
  syncLinksFromSource,
  upsertLink,
} from "./repo/barracks";
import { upsertGuild } from "./repo/guilds";
import { linkedAccounts, rosterShares } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "990";

async function denied(query: PromiseLike<unknown>) {
  const err = await Promise.resolve(query).then(
    () => null,
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
  expect(err, "should be refused").toMatch(/permission denied/);
}
const steam = (id: string, name: string) => ({
  userId: "u1",
  provider: "steam",
  accountId: id,
  displayName: name,
  verified: true,
  source: "discord" as const,
});

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

describe("barracks, as garrison_bot", () => {
  it("links a claimed OSRS account and shares it with one server only", async () => {
    await upsertLink(db, {
      userId: "u1",
      provider: "osrs",
      accountId: "zezima",
      displayName: "Zezima",
      verified: false,
      source: "claimed",
      details: { total: 2277 },
    });
    expect(await getRoster(db, G)).toEqual([]); // not shared yet
    await setRosterShare(db, G, "u1", "taner", true);
    const roster = await getRoster(db, G);
    expect(roster).toHaveLength(1);
    expect(roster[0]?.links[0]).toMatchObject({ provider: "osrs", verified: false });
  });

  it("removes by provider, and stops sharing", async () => {
    expect(await removeProviderLinks(db, "u1", "osrs")).toBe(1);
    expect(await getRoster(db, G)).toEqual([]);
    await upsertLink(db, {
      userId: "u1",
      provider: "osrs",
      accountId: "zezima",
      displayName: "Zezima",
      verified: false,
      source: "claimed",
    });
    expect((await getRoster(db, G)).length).toBe(1);
    await setRosterShare(db, G, "u1", "taner", false);
    expect(await getRoster(db, G)).toEqual([]);
    await setRosterShare(db, G, "u1", "taner", true);
  });

  it("can't delete links or shares", async () => {
    await denied(db.delete(linkedAccounts));
    await denied(db.delete(rosterShares));
    await denied(db.update(linkedAccounts).set({ userId: "someone-else" }));
  });
});

describe("barracks, as garrison_web", () => {
  it("syncs Discord Connections: adds new, removes ones the member unlinked", async () => {
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    await syncLinksFromSource(
      db,
      "u1",
      "discord",
      ["steam", "xbox"],
      [steam("1", "taner_s"), steam("2", "alt")],
    );
    expect(
      (await listLinks(db, "u1"))
        .filter((l) => l.provider === "steam")
        .map((l) => l.accountId)
        .sort(),
    ).toEqual(["1", "2"]);
    const r = await syncLinksFromSource(
      db,
      "u1",
      "discord",
      ["steam", "xbox"],
      [steam("1", "taner_s")],
    );
    expect(r.removed).toBe(1);
    // The claimed OSRS link from another source is untouched.
    expect((await listLinks(db, "u1")).map((l) => l.provider).sort()).toEqual(["osrs", "steam"]);
  });

  it("lets a member remove only their own links", async () => {
    const [mine] = await listLinks(db, "u1");
    expect(await removeLink(db, "someone-else", mine?.id ?? "")).toBeNull();
    expect(await removeLink(db, "u1", mine?.id ?? "")).not.toBeNull();
    expect((await listSharesForUser(db, "u1")).map((s) => s.guildName)).toEqual(["Scapewatch"]);
  });

  it("can't delete, or create shares on a member's behalf", async () => {
    await denied(db.delete(linkedAccounts));
    await denied(db.insert(rosterShares).values({ guildId: G, userId: "victim", username: "x" }));
  });
});
