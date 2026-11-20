import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { linkedAccounts, rankProfiles, rosterShares, webSessions } from "../schema";
import { createTestDb } from "../testing";
import { eraseMyData, exportMyData, listMySignIns, signOutElsewhere } from "./account";
import { listLinks, removeLink, upsertLink } from "./barracks";
import { upsertGuild } from "./guilds";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const ME = "100000000000000010";
const OTHER = "100000000000000020";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const later = new Date(Date.now() + 86_400_000);

describe("Your account: a person's own data, as the dashboard's role", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: "11", name: "Alpha" });
    await as("postgres");
    for (const userId of [ME, OTHER]) {
      await db.insert(webSessions).values([
        { tokenHash: `${userId}-a`, userId, username: "u", expiresAt: later },
        { tokenHash: `${userId}-b`, userId, username: "u", expiresAt: later },
      ]);
      await db.insert(rosterShares).values({ guildId: "11", userId, username: "u" });
      await db.insert(rankProfiles).values({ guildId: "11", userId, details: { main: "Mage" } });
    }
    await as("garrison_web");
    for (const userId of [ME, OTHER])
      await upsertLink(db, {
        userId,
        provider: "steam",
        accountId: `steam-${userId}`,
        displayName: "Rook",
        verified: true,
        source: "discord",
        details: { hours: 12 },
      });
  });
  afterAll(() => close());

  it("signs out every other browser, and only this person's", async () => {
    await as("garrison_web");
    expect(await listMySignIns(db, ME)).toHaveLength(2);
    expect(await signOutElsewhere(db, ME, `${ME}-a`)).toBe(1);
    expect((await listMySignIns(db, ME)).map((s) => s.tokenHash)).toEqual([`${ME}-a`]);
    expect(await listMySignIns(db, OTHER)).toHaveLength(2);
  });

  it("exports only this person's own rows", async () => {
    await as("garrison_web");
    const data = await exportMyData(db, ME);
    expect(data.linkedAccounts).toHaveLength(1);
    expect(data.linkedAccounts[0]).toMatchObject({ displayName: "Rook", details: { hours: 12 } });
    expect(data.sharedWith).toMatchObject([{ server: "Alpha", stoppedAt: null }]);
    expect(data.rankCardDetails).toMatchObject([{ details: { main: "Mage" } }]);
    expect(data.signIns).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain(OTHER);
    expect(JSON.stringify(data)).not.toContain(`${ME}-a`);
  });

  it("wipes a removed link's name and details, keeping the account ID to re-link", async () => {
    await as("garrison_web");
    const [link] = await listLinks(db, OTHER);
    await removeLink(db, OTHER, link?.id ?? "");
    expect(link).toBeDefined();
    await as("postgres");
    const rows = (await db.select().from(linkedAccounts)).filter((r) => r.userId === OTHER);
    expect(rows[0]).toMatchObject({ displayName: "", details: {}, accountId: `steam-${OTHER}` });
    expect(rows[0]?.removedAt).toBeInstanceOf(Date);
  });

  it("erases what the person controls and signs them out everywhere, nobody else", async () => {
    await as("garrison_web");
    const done = await eraseMyData(db, ME);
    expect(done).toMatchObject({ shares: 1, cards: 1 });
    expect(await listLinks(db, ME)).toHaveLength(0);
    expect(await listMySignIns(db, ME)).toHaveLength(0);
    await as("postgres");
    const mine = (await db.select().from(linkedAccounts)).filter((r) => r.userId === ME);
    expect(mine[0]).toMatchObject({ displayName: "", details: {} });
    const cards = await db.select().from(rankProfiles);
    expect(cards.find((c) => c.userId === ME)?.details).toEqual({});
    expect(cards.find((c) => c.userId === OTHER)?.details).toEqual({ main: "Mage" });
    const shares = await db.select().from(rosterShares);
    expect(shares.find((s) => s.userId === ME)?.removedAt).toBeInstanceOf(Date);
    expect(shares.find((s) => s.userId === OTHER)?.removedAt).toBeNull();
  });
});
