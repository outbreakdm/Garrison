import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { guildPlans, planBundles, platformStaff } from "../schema";
import { createTestDb } from "../testing";
import { upsertGuild } from "./guilds";
import {
  assignSeat,
  getPlanDetails,
  listAgencyPlans,
  releaseSeat,
  removeAgencyComp,
  setAgencyComp,
  setComp,
} from "./plans";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const STAFF = "100000000000000001";
const OWNER = "100000000000000010";
const OTHER = "100000000000000020";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const refused = (q: PromiseLike<unknown>) =>
  Promise.resolve(q).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );

describe("Agency plans: Pro on several servers under one subscription", () => {
  let bundle = "";
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    for (const [id, name] of [
      ["11", "Alpha"],
      ["12", "Bravo"],
      ["13", "Charlie"],
      ["14", "Paid"],
      ["15", "Echo"],
    ] as const)
      await upsertGuild(db, { id, name });
    await as("postgres");
    await db.insert(platformStaff).values({ userId: STAFF });
    await db.insert(guildPlans).values({ guildId: "14", plan: "pro", source: "stripe" });
  });
  afterAll(() => close());

  it("only staff give a complimentary Agency plan, and nobody writes the table directly", async () => {
    await as("garrison_web");
    expect(await refused(setAgencyComp(db, OWNER, OWNER, 2, "self"))).toMatch(/not staff/);
    expect(await refused(db.insert(planBundles).values({ ownerId: OWNER }))).toMatch(
      /permission denied/,
    );
    bundle = await setAgencyComp(db, STAFF, OWNER, 2, "Test agency");
    expect(bundle).toMatch(/^[0-9a-f-]{36}$/);
    const [plan] = await listAgencyPlans(db, OWNER);
    expect(plan).toMatchObject({ seats: 2, source: "comp", servers: [] });
  });

  it("lets the owner fill seats up to the count, and no one else", async () => {
    await as("garrison_web");
    expect(await assignSeat(db, OTHER, bundle, "11")).toBe("not_owner");
    expect(await assignSeat(db, OWNER, bundle, "11")).toBe("assigned");
    expect(await assignSeat(db, OWNER, bundle, "11")).toBe("assigned");
    expect(await assignSeat(db, OWNER, bundle, "12")).toBe("assigned");
    expect(await assignSeat(db, OWNER, bundle, "13")).toBe("full");
    expect((await getPlanDetails(db, "11")).source).toBe("bundle");
    expect((await getPlanDetails(db, "13")).plan).toBe("free");
    const [plan] = await listAgencyPlans(db, OWNER);
    expect(plan?.servers.map((s) => s.name)).toEqual(["Alpha", "Bravo"]);
  });

  it("never takes over a server that has Pro some other way", async () => {
    await as("garrison_web");
    await releaseSeat(db, OWNER, "12");
    expect(await assignSeat(db, OWNER, bundle, "14")).toBe("paid");
    expect((await getPlanDetails(db, "14")).source).toBe("stripe");
    // Staff can't comp over a seat either.
    expect(await setComp(db, STAFF, "11", true, "x")).toBe("paid");
    const other = await setAgencyComp(db, STAFF, OTHER, 1, null);
    expect(await assignSeat(db, OTHER, other, "11")).toBe("taken");
  });

  it("frees a seat only for its owner", async () => {
    await as("garrison_web");
    expect(await releaseSeat(db, OTHER, "11")).toBe("not_owner");
    expect(await releaseSeat(db, OWNER, "11")).toBe("free");
    expect((await getPlanDetails(db, "11")).plan).toBe("free");
  });

  it("shrinking the plan frees the newest seats; removing it frees them all", async () => {
    await as("garrison_web");
    expect(await assignSeat(db, OWNER, bundle, "11")).toBe("assigned");
    expect(await assignSeat(db, OWNER, bundle, "15")).toBe("assigned");
    await setAgencyComp(db, STAFF, OWNER, 1, "Smaller");
    let [plan] = await listAgencyPlans(db, OWNER);
    expect(plan?.servers.map((s) => s.guildId)).toEqual(["11"]);
    expect(await removeAgencyComp(db, STAFF, bundle)).toBe(true);
    [plan] = await listAgencyPlans(db, OWNER);
    expect(plan).toBeUndefined();
    expect((await getPlanDetails(db, "11")).plan).toBe("free");
  });
});
