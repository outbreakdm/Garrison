import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { createTestDb } from "../testing";
import { upsertGuild } from "./guilds";
import { addActivity, getInsights, pruneInsights, recordMemberFlow } from "./insights";
import { addMessageCounts } from "./metrics";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "200000000000000009";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const refused = (q: PromiseLike<unknown>) =>
  Promise.resolve(q).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
const DAY = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("server insights", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: G, name: "Insights" });
  });
  afterAll(async () => close());

  it("adds counts, folds them, and reads them back for the dashboard", async () => {
    const now = Date.now();
    const today = day(now);
    const hour = Math.floor(now / 3_600_000) * 3_600_000;
    await as("garrison_bot");
    await addMessageCounts(db, new Map([[G, 5]]));
    const batch = () => ({
      channels: new Map([
        [`${G}|${today}|300000000000000001`, 4],
        [`${G}|${today}|300000000000000002`, 1],
      ]),
      hours: new Map([[`${G}|${hour}`, 5]]),
      members: new Map([
        [`${G}|${today}|500000000000000001`, 3],
        [`${G}|${today}|500000000000000002`, 2],
        [`${G}|${day(now - 40 * DAY)}|500000000000000003`, 1],
      ]),
    });
    await addActivity(db, batch());
    await addActivity(db, batch()); // a second minute adds to the first
    // Joined 10 days ago: one stayed, one left after two days. One joined today.
    await as("postgres");
    await exec(`
      INSERT INTO member_flow (guild_id, user_id, kind, at, inviter_id, inviter_name) VALUES
        ('${G}', '600000000000000001', 'join', now() - interval '10 days', '700000000000000001', 'kel'),
        ('${G}', '600000000000000002', 'join', now() - interval '10 days', '700000000000000001', 'kel'),
        ('${G}', '600000000000000002', 'leave', now() - interval '8 days', null, null)`);
    await as("garrison_bot");
    await recordMemberFlow(db, { guildId: G, userId: "600000000000000003", kind: "join" });

    // The bot can't delete counts itself; only the prune function removes old rows.
    expect(await refused(exec("DELETE FROM member_activity_daily"))).toMatch(/permission denied/);
    expect(await pruneInsights(db)).toBe(1); // the 40-day-old member row

    await as("garrison_web");
    const data = await getInsights(db, G, 30);
    const t = data.daily.at(-1);
    expect(t).toMatchObject({ day: today, messages: 5, joins: 1, active: 2 });
    expect(data.totals).toMatchObject({ messages: 5, joins: 3, leaves: 1, active: 2 });
    expect(data.retention).toEqual({ joined: 2, stayed: 1 });
    expect(data.channels).toEqual([
      { channelId: "300000000000000001", messages: 8 },
      { channelId: "300000000000000002", messages: 2 },
    ]);
    expect(data.hours.reduce((a, b) => a + b, 0)).toBe(10);
    expect(data.invites).toEqual([
      { inviterId: "700000000000000001", inviterName: "kel", joins: 2, stayed: 1 },
    ]);
    expect(
      await refused(
        exec("INSERT INTO member_flow (guild_id, user_id, kind) VALUES ('x', 'y', 'join')"),
      ),
    ).toMatch(/permission denied/);
  });
});
