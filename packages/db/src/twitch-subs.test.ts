import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertLink } from "./repo/barracks";
import { upsertGuild } from "./repo/guilds";
import {
  addTwitchSubscriber,
  connectTwitchSubs,
  disconnectTwitchSubs,
  followsTwitch,
  listTwitchSubRoleGuilds,
  removeTwitchSubscriber,
  replaceTwitchSubscribers,
  revokeTwitchSubs,
  setTwitchSubRoleId,
  twitchSubscriberDiscordIds,
} from "./repo/twitch-subs";
import { twitchSubRoles } from "./schema";
import { createTestDb } from "./testing";

describe("Twitch subscriber roles", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "100000000000000901";
  const B = "5550001";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await upsertGuild(db, { id: G, name: "Streamer HQ" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("connects, keeps the list from Twitch, and maps subscribers to linked members", async () => {
    await exec("SET ROLE garrison_web");
    await connectTwitchSubs(db, {
      guildId: G,
      broadcasterId: B,
      broadcasterLogin: "streamer",
      connectedBy: "1",
    });
    await setTwitchSubRoleId(db, G, "100000000000000999");
    await replaceTwitchSubscribers(db, B, [
      { userId: "t-ana", tier: "1000" },
      { userId: "t-kel", tier: "2000" },
    ]);
    await addTwitchSubscriber(db, B, "t-new", "1000");
    await removeTwitchSubscriber(db, B, "t-kel");
    // Ana linked her Twitch through Discord Connections; nobody linked t-new.
    await upsertLink(db, {
      userId: "discord-ana",
      provider: "twitch",
      accountId: "t-ana",
      displayName: "ana",
      verified: true,
      source: "discord",
    });
    expect(await followsTwitch(db, B)).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect([...(await twitchSubscriberDiscordIds(db, B))]).toEqual(["discord-ana"]);
    expect((await listTwitchSubRoleGuilds(db)).map((r) => r.guildId)).toEqual([G]);
    // The bot only reads.
    const err = await Promise.resolve(db.delete(twitchSubRoles)).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });

  it("stops when Twitch revokes access, and forgets the list when nobody follows", async () => {
    await exec("SET ROLE garrison_web");
    await revokeTwitchSubs(db, B);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await listTwitchSubRoleGuilds(db)).toEqual([]);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect(await disconnectTwitchSubs(db, G)).toBe(B);
    expect(await followsTwitch(db, B)).toBe(false);
    await exec("RESET ROLE");
    expect((await twitchSubscriberDiscordIds(db, B)).size).toBe(0);
  });
});
