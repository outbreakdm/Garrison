import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  claimStarPost,
  getStarboard,
  getStarPost,
  listStarPosts,
  releaseStarPost,
  setStarMessage,
} from "./repo/starboard";
import { checkStarboard, DEFAULT_STARBOARD, reachesBoard, readStarboard } from "./starboard";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const C = "300000000000000001";
const ok = { enabled: true, channelId: C, emoji: "⭐", threshold: 3 };

describe("starboard rules", () => {
  it("is free, with the color on Pro", () => {
    expect(checkStarboard(ok, free, DEFAULT_STARBOARD).ok).toBe(true);
    expect(checkStarboard({ ...ok, accent: "#5ab0ff" }, free, DEFAULT_STARBOARD).ok).toBe(false);
    expect(checkStarboard({ ...ok, accent: "#5ab0ff" }, pro, DEFAULT_STARBOARD).ok).toBe(true);
    const saved = { ...DEFAULT_STARBOARD, accent: "#5ab0ff" };
    expect(checkStarboard({ ...ok, accent: "#5ab0ff" }, free, saved).ok).toBe(true);
  });

  it("needs a channel when on, one emoji, and a sane threshold", () => {
    expect(checkStarboard({ ...ok, channelId: "" }, pro, DEFAULT_STARBOARD).ok).toBe(false);
    expect(checkStarboard({ ...ok, emoji: "ab" }, pro, DEFAULT_STARBOARD).ok).toBe(false);
    expect(checkStarboard({ ...ok, threshold: 0 }, pro, DEFAULT_STARBOARD).ok).toBe(false);
    expect(readStarboard({ emoji: "nope", threshold: 99 })).toMatchObject({
      emoji: "⭐",
      threshold: 3,
    });
  });

  it("leaves out the author's own star unless the server counts it", () => {
    expect(reachesBoard({ threshold: 3, selfStar: false }, 3, true)).toEqual({
      stars: 2,
      on: false,
    });
    expect(reachesBoard({ threshold: 3, selfStar: true }, 3, true)).toEqual({ stars: 3, on: true });
  });
});

describe("starboard storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "997";

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

  it("lets the dashboard set it up and the bot post each message once", async () => {
    await exec("SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "starboard",
      patch: { enabled: true, channelId: C, threshold: 2 },
      userId: "1",
      username: "taner",
    });
    expect(r.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await getStarboard(db, G)).toMatchObject({ enabled: true, channelId: C, threshold: 2 });
    const post = { guildId: G, messageId: "m1", channelId: C, authorId: "a1", stars: 2 };
    expect(await claimStarPost(db, post)).toBe(true);
    expect(await claimStarPost(db, post)).toBe(false);
    // A failed repost gives the claim back; one that reached Discord can't be released.
    await releaseStarPost(db, G, "m1");
    expect(await claimStarPost(db, post)).toBe(true);
    await setStarMessage(db, G, "m1", "s1");
    await releaseStarPost(db, G, "m1");
    expect((await getStarPost(db, G, "m1"))?.starMessageId).toBe("s1");
    expect(await listStarPosts(db, G)).toHaveLength(1);
    await exec("RESET ROLE");
  });
});
