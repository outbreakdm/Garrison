import { recordBillingEvent, revokeSupplyPack } from "@garrison/db";
import type Stripe from "stripe";
import {
  applySubscription,
  applySupplyPack,
  getBillingDb,
  stripe,
  verifyEvent,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

/** Subscription lifecycle: these can change who has Pro. */
const LIFECYCLE = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

/**
 * Risk events on a subscription's charge. A dispute or an early fraud warning cancels the
 * subscription at once (Pro ends, nothing on the server is deleted); a refund is only
 * reconciled, since a partial refund is a goodwill gesture, not an end to the plan.
 */
const RISK = new Set([
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
  "charge.refunded",
]);
const CANCELS = new Set(["charge.dispute.created", "radar.early_fraud_warning.created"]);

type Ref = string | { id: string } | null | undefined;
const idOf = (r: Ref) => (typeof r === "string" ? r : (r?.id ?? null));

/** The subscription a lifecycle event is about, read from the event object itself. */
function lifecycleSubscription(event: Stripe.Event): string | null {
  const o = event.data.object as unknown as {
    object: string;
    id: string;
    subscription?: Ref;
    parent?: { subscription_details?: { subscription?: Ref } };
  };
  if (o.object === "subscription") return o.id;
  return idOf(o.subscription) ?? idOf(o.parent?.subscription_details?.subscription);
}

/** The payment behind a charge, dispute or fraud warning. */
async function riskPayment(event: Stripe.Event): Promise<string | null> {
  const o = event.data.object as unknown as { payment_intent?: Ref; charge?: Ref };
  const paymentIntent = idOf(o.payment_intent);
  if (paymentIntent || !o.charge) return paymentIntent;
  const charge = await stripe().charges.retrieve(idOf(o.charge) as string);
  return idOf(charge.payment_intent as Ref);
}

/**
 * A risk event's effect on a supply pack: a full refund, a dispute or a fraud warning stops
 * what's left of it. A partial refund is a goodwill gesture and leaves the pack alone.
 */
async function revokePack(db: Awaited<ReturnType<typeof getBillingDb>>, event: Stripe.Event) {
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (!charge.refunded) return;
  }
  const paymentIntent = await riskPayment(event);
  if (paymentIntent) await revokeSupplyPack(db, paymentIntent);
}

/**
 * The subscription behind a charge, dispute or fraud warning: through Stripe's object
 * graph (payment intent → invoice payment → invoice → subscription), not metadata.
 */
async function riskSubscription(event: Stripe.Event): Promise<string | null> {
  const o = event.data.object as unknown as { payment_intent?: Ref; charge?: Ref };
  let paymentIntent = idOf(o.payment_intent);
  if (!paymentIntent && o.charge) {
    const charge = await stripe().charges.retrieve(idOf(o.charge) as string);
    paymentIntent = idOf(charge.payment_intent as Ref);
  }
  if (!paymentIntent) return null;
  const payments = await stripe().invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntent },
    limit: 1,
  });
  const invoiceId = idOf(payments.data[0]?.invoice as Ref);
  if (!invoiceId) return null;
  const invoice = await stripe().invoices.retrieve(invoiceId);
  return idOf(
    (invoice as unknown as { parent?: { subscription_details?: { subscription?: Ref } } }).parent
      ?.subscription_details?.subscription,
  );
}

/**
 * Stripe → Garrison. Checks the signature, then always re-reads the subscription from
 * Stripe before applying it, so a late or repeated event can never roll a plan back.
 * Writes go through the garrison_billing login, which can do nothing but call the
 * billing functions. Each event is recorded once, after it's applied.
 */
export async function POST(request: Request) {
  let event: Stripe.Event;
  try {
    event = await verifyEvent(await request.text(), request.headers.get("stripe-signature"));
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  const lifecycle = LIFECYCLE.has(event.type);
  if (!lifecycle && !RISK.has(event.type)) return Response.json({ received: true });

  const db = await getBillingDb();
  // A supply pack: a one-time payment, granted only once Stripe says it's paid (at once for
  // cards, or later for a payment method that settles afterwards).
  const session = event.data.object as Stripe.Checkout.Session;
  if (event.type.startsWith("checkout.session.") && session.mode === "payment") {
    await applySupplyPack(db, session);
    await recordBillingEvent(db, event.id, event.type);
    return Response.json({ received: true });
  }
  if (!lifecycle) await revokePack(db, event);
  const id = lifecycle ? lifecycleSubscription(event) : await riskSubscription(event);
  if (id) {
    let sub = await stripe().subscriptions.retrieve(id);
    if (CANCELS.has(event.type) && sub.status !== "canceled") {
      sub = await stripe().subscriptions.cancel(id, { prorate: false });
    }
    await applySubscription(db, sub);
  }
  await recordBillingEvent(db, event.id, event.type);
  return Response.json({ received: true });
}
