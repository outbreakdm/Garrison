import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { platformStaff, supplyGrants } from "../schema";
import { createTestDb } from "../testing";
import { packsLeft } from "./ai-usage";
import {
  grantSupplyPack,
  recordBillingEvent,
  revokeSupplyPack,
  type SubscriptionState,
  setAgencyBilling,
  setGuildBilling,
} from "./billing";
import { upsertGuild } from "./guilds";
import { assignSeat, getPlanDetails, listAgencyPlans, setAgencyComp } from "./plans";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const STAFF = "100000000000000001";
const BUYER = "100000000000000030";
const G1 = "200000000000000001";
const G2 = "200000000000000002";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const refused = (q: PromiseLike<unknown>) =>
  Promise.resolve(q).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
const sub = (id: string, active = true): SubscriptionState => ({
  active,
  customerId: "cus_test",
  subscriptionId: id,
  status: active ? "active" : "canceled",
  periodEnd: new Date("2026-12-14T00:00:00Z"),
  cancelAtPeriodEnd: false,
});

describe("billing: only the Stripe webhook's role writes paid plans", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: G1, name: "Paid" });
    await upsertGuild(db, { id: G2, name: "Seat" });
    await as("postgres");
    await db.insert(platformStaff).values({ userId: STAFF });
  });
  afterAll(() => close());

  it("refuses the dashboard and the bot", async () => {
    for (const role of ["garrison_web", "garrison_bot"]) {
      await as(role);
      expect(await refused(setGuildBilling(db, G1, BUYER, sub("sub_1")))).toMatch(
        /permission denied/,
      );
      expect(await refused(recordBillingEvent(db, "evt_1", "x"))).toMatch(/permission denied/);
    }
  });

  it("applies each Stripe event once", async () => {
    await as("garrison_billing");
    expect(await recordBillingEvent(db, "evt_1", "checkout.session.completed")).toBe(true);
    expect(await recordBillingEvent(db, "evt_1", "checkout.session.completed")).toBe(false);
  });

  it("turns a server's Pro on and off with its own subscription", async () => {
    await as("garrison_billing");
    expect(await setGuildBilling(db, G1, BUYER, sub("sub_1"))).toBe("pro");
    await as("garrison_web");
    const on = await getPlanDetails(db, G1);
    expect(on).toMatchObject({ plan: "pro", source: "stripe", paidBy: BUYER });
    expect(on.stripeCustomerId).toBe("cus_test");
    await as("garrison_billing");
    // A different subscription ending never touches this one.
    expect(await setGuildBilling(db, G1, BUYER, sub("sub_other", false))).toBe("ignored");
    expect(await setGuildBilling(db, G1, BUYER, sub("sub_1", false))).toBe("free");
    await as("garrison_web");
    expect((await getPlanDetails(db, G1)).plan).toBe("free");
  });

  it("paying for Pro takes a server out of its Agency seat", async () => {
    await as("garrison_web");
    const bundle = await setAgencyComp(db, STAFF, BUYER, 2, null);
    expect(await assignSeat(db, BUYER, bundle, G2)).toBe("assigned");
    await as("garrison_billing");
    expect(await setGuildBilling(db, G2, BUYER, sub("sub_2"))).toBe("pro");
    await as("garrison_web");
    expect(await getPlanDetails(db, G2)).toMatchObject({ source: "stripe", bundleId: null });
    const [plan] = await listAgencyPlans(db, BUYER);
    expect(plan?.servers).toEqual([]);
  });

  it("creates, updates and removes a paid Agency plan", async () => {
    await as("garrison_billing");
    expect(await setAgencyBilling(db, BUYER, 5, sub("sub_agency"))).toBe("agency");
    expect(
      await setAgencyBilling(db, BUYER, 5, { ...sub("sub_agency"), cancelAtPeriodEnd: true }),
    ).toBe("agency");
    await as("garrison_web");
    const paid = (await listAgencyPlans(db, BUYER)).find((p) => p.source === "stripe");
    expect(paid).toMatchObject({ seats: 5, cancelAtPeriodEnd: true });
    await as("garrison_billing");
    expect(await setAgencyBilling(db, BUYER, 5, sub("sub_agency", false))).toBe("removed");
    await as("garrison_web");
    expect((await listAgencyPlans(db, BUYER)).some((p) => p.source === "stripe")).toBe(false);
  });

  it("grants a supply pack once per Checkout Session, and a refund stops what's left", async () => {
    const purchase = {
      sessionId: "cs_test_1",
      guildId: G1,
      pack: "small",
      supplies: 1000,
      amountCents: 299,
      paymentIntent: "pi_test_1",
      buyerId: BUYER,
    };
    for (const role of ["garrison_web", "garrison_bot"]) {
      await as(role);
      expect(await refused(grantSupplyPack(db, purchase))).toMatch(/permission denied/);
    }
    await as("garrison_billing");
    expect(await grantSupplyPack(db, purchase)).toBe("granted");
    // Stripe retried the event: nothing more.
    expect(await grantSupplyPack(db, purchase)).toBe("duplicate");
    // Only the packs Garrison sells.
    expect(await grantSupplyPack(db, { ...purchase, sessionId: "cs_test_2", supplies: 9999 })).toBe(
      "ignored",
    );
    await as("garrison_bot");
    expect(await packsLeft(db, G1)).toBe(1000);
    // The bot counts what packs pay for; it can't give a server more.
    expect(await refused(db.update(supplyGrants).set({ supplies: 99_999 }))).toMatch(
      /permission denied/,
    );
    await as("garrison_billing");
    expect(await revokeSupplyPack(db, "pi_test_1")).toBe(true);
    await as("garrison_bot");
    expect(await packsLeft(db, G1)).toBe(0);
  });
});
