import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { guildPlans, platformStaff } from "../schema";
import { createTestDb } from "../testing";
import { upsertGuild } from "./guilds";
import { getPlanDetails, isStaff, listServerPlans, setComp } from "./plans";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const STAFF = "100000000000000001";
const STRANGER = "100000000000000002";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const refused = (q: PromiseLike<unknown>) =>
  Promise.resolve(q).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );

describe("plans in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: "1", name: "Alpha" });
    await upsertGuild(db, { id: "2", name: "Bravo" });
    await as("postgres");
    await db.insert(platformStaff).values({ userId: STAFF });
    await db.insert(guildPlans).values({ guildId: "2", plan: "pro", source: "stripe" });
  });
  afterAll(() => close());

  it("lets the dashboard read staff but never add them", async () => {
    await as("garrison_web");
    expect(await isStaff(db, STAFF)).toBe(true);
    expect(await isStaff(db, STRANGER)).toBe(false);
    expect(await refused(db.insert(platformStaff).values({ userId: STRANGER }))).toMatch(
      /permission denied/,
    );
  });

  it("gives and removes complimentary Pro for staff only", async () => {
    await as("garrison_web");
    expect(await refused(setComp(db, STRANGER, "1", true))).toMatch(/not staff/);
    expect(await setComp(db, STAFF, "1", true, "  my test server ")).toBe("comp");
    expect(await getPlanDetails(db, "1")).toMatchObject({
      plan: "pro",
      source: "comp",
      grantedBy: STAFF,
      note: "my test server",
    });
    expect(await setComp(db, STAFF, "1", false)).toBe("free");
    expect((await getPlanDetails(db, "1")).plan).toBe("free");
  });

  it("never changes a plan someone pays for", async () => {
    await as("garrison_web");
    expect(await setComp(db, STAFF, "2", true)).toBe("paid");
    expect(await setComp(db, STAFF, "2", false)).toBe("paid");
    expect(await getPlanDetails(db, "2")).toMatchObject({ plan: "pro", source: "stripe" });
  });

  it("lists every server with its plan for the staff page", async () => {
    await as("garrison_web");
    const rows = await listServerPlans(db);
    expect(rows.map((r) => [r.name, r.plan, r.source])).toEqual([
      ["Alpha", "free", null],
      ["Bravo", "pro", "stripe"],
    ]);
  });

  it("keeps the bot out of the comp function", async () => {
    await as("garrison_bot");
    expect(await refused(setComp(db, STAFF, "1", true))).toMatch(/permission denied/);
  });
});
