import { BILLING_ACTIVE, type SubscriptionState } from "@garrison/db";
import type Stripe from "stripe";

/** Pure parts of billing: what Garrison reads from a Stripe subscription. Tested. */

/** What Garrison keeps from a subscription. The period end moved onto items in newer API versions. */
export function subscriptionState(sub: Stripe.Subscription): SubscriptionState {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const end = item?.current_period_end ?? legacy;
  return {
    active: BILLING_ACTIVE.has(sub.status),
    customerId: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
    subscriptionId: sub.id,
    status: sub.status,
    periodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

/** The metadata Garrison puts on every subscription it starts. */
export interface PlanMetadata {
  tier: "pro" | "agency";
  /** Discord user who bought it. */
  userId: string;
  /** The server, for Pro. */
  guildId?: string;
}

export function readMetadata(meta: Stripe.Metadata | null | undefined): PlanMetadata | null {
  const tier = meta?.tier;
  const userId = meta?.userId ?? "";
  // The payer's ID is written by Garrison's own server; the database checks it again
  // where it matters (an Agency owner must be a full Discord ID).
  if ((tier !== "pro" && tier !== "agency") || !/^\d{1,20}$/.test(userId)) return null;
  const guildId = meta?.guildId;
  if (tier === "pro" && !(guildId && /^\d{17,20}$/.test(guildId))) return null;
  return { tier, userId, guildId };
}
