import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { readMetadata, subscriptionState } from "./billing-state";

const USER = "100000000000000030";
const GUILD = "200000000000000001";

describe("billing: reading Stripe subscriptions", () => {
  it("accepts only metadata Garrison wrote", () => {
    expect(readMetadata({ tier: "pro", userId: USER, guildId: GUILD })).toEqual({
      tier: "pro",
      userId: USER,
      guildId: GUILD,
    });
    expect(readMetadata({ tier: "agency", userId: USER })).toMatchObject({ tier: "agency" });
    expect(readMetadata({ tier: "pro", userId: USER })).toBeNull();
    expect(readMetadata({ tier: "gold", userId: USER })).toBeNull();
    expect(readMetadata({ tier: "agency", userId: "me" })).toBeNull();
    expect(readMetadata(null)).toBeNull();
  });

  it("keeps Pro through payment retries and reads the period end from items", () => {
    const sub = (status: string) =>
      ({
        id: "sub_1",
        status,
        customer: "cus_1",
        cancel_at_period_end: true,
        items: { data: [{ current_period_end: 1_800_000_000 }] },
      }) as unknown as Stripe.Subscription;
    expect(subscriptionState(sub("active"))).toMatchObject({
      active: true,
      customerId: "cus_1",
      cancelAtPeriodEnd: true,
      periodEnd: new Date(1_800_000_000 * 1000),
    });
    expect(subscriptionState(sub("past_due")).active).toBe(true);
    expect(subscriptionState(sub("unpaid")).active).toBe(false);
    expect(subscriptionState(sub("canceled")).active).toBe(false);
  });
});
