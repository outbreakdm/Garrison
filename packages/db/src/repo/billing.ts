import { sql } from "drizzle-orm";
import type { Db } from "../client";

/**
 * Billing writes, run only by the Stripe webhook as garrison_billing. Each is one
 * database function that checks its own inputs; the role can do nothing else.
 */

async function one<T>(db: Db, query: ReturnType<typeof sql>): Promise<T | undefined> {
  const result = await db.execute<{ result: T }>(query);
  const rows = (Array.isArray(result) ? result : (result as { rows: { result: T }[] }).rows) as {
    result: T;
  }[];
  return rows[0]?.result;
}

/** Note a Stripe event as applied. False when it was already applied (Stripe retried). */
export async function recordBillingEvent(db: Db, eventId: string, type: string) {
  return Boolean(
    await one<boolean>(db, sql`SELECT public.billing_record_event(${eventId}, ${type}) AS result`),
  );
}

export interface SubscriptionState {
  /** True while the subscription should give Pro (active, trialing, or past due during retries). */
  active: boolean;
  customerId: string | null;
  subscriptionId: string;
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** A server's own Pro subscription changed. Returns 'pro', 'free' or 'ignored'. */
export async function setGuildBilling(
  db: Db,
  guildId: string,
  payerId: string | null,
  s: SubscriptionState,
): Promise<"pro" | "free" | "ignored"> {
  const end = s.periodEnd ? s.periodEnd.toISOString() : null;
  return (
    (await one<"pro" | "free" | "ignored">(
      db,
      sql`SELECT public.billing_set_guild(${guildId}, ${s.active}, ${s.customerId}, ${s.subscriptionId},
        ${s.status}, ${end}::timestamptz, ${s.cancelAtPeriodEnd}, ${payerId}) AS result`,
    )) ?? "ignored"
  );
}

/** An Agency subscription changed. Returns 'agency', 'removed' or 'ignored'. */
export async function setAgencyBilling(
  db: Db,
  ownerId: string,
  seats: number,
  s: SubscriptionState,
): Promise<"agency" | "removed" | "ignored"> {
  const end = s.periodEnd ? s.periodEnd.toISOString() : null;
  return (
    (await one<"agency" | "removed" | "ignored">(
      db,
      sql`SELECT public.billing_set_agency(${ownerId}, ${seats}::int, ${s.active}, ${s.customerId},
        ${s.subscriptionId}, ${s.status}, ${end}::timestamptz, ${s.cancelAtPeriodEnd}) AS result`,
    )) ?? "ignored"
  );
}

/**
 * Stripe statuses that keep Pro on. `past_due` keeps it through Stripe's payment retries;
 * `unpaid`, `canceled` and `incomplete_expired` end it.
 */
export const BILLING_ACTIVE = new Set(["active", "trialing", "past_due"]);
