import "server-only";
import {
  createDb,
  type Db,
  describeDbRole,
  grantSupplyPack,
  PRICING,
  roleProblem,
  SUPPLY_PACKS,
  type SupplyPack,
  setAgencyBilling,
  setGuildBilling,
} from "@garrison/db";
import Stripe from "stripe";
import { readMetadata, subscriptionState } from "./billing-state";

export type { PlanMetadata } from "./billing-state";
export { readMetadata, subscriptionState } from "./billing-state";

/**
 * Stripe billing for Pro (one server) and Agency (up to 5 servers). Everything here
 * reads its settings from the environment and does nothing until they are all set:
 * until then the pages show launch prices and no buy buttons.
 *
 * - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * - STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
 *   STRIPE_PRICE_AGENCY_MONTHLY, STRIPE_PRICE_AGENCY_YEARLY (price IDs, price_...)
 * - BILLING_DATABASE_URL: the garrison_billing login, used only by the webhook.
 */

export type PaidTier = "pro" | "agency";
export type Interval = "month" | "year";

const PRICE_ENV: Record<PaidTier, Record<Interval, string>> = {
  pro: { month: "STRIPE_PRICE_PRO_MONTHLY", year: "STRIPE_PRICE_PRO_YEARLY" },
  agency: { month: "STRIPE_PRICE_AGENCY_MONTHLY", year: "STRIPE_PRICE_AGENCY_YEARLY" },
};

const read = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};

export const priceId = (tier: PaidTier, interval: Interval) => read(PRICE_ENV[tier][interval]);

/**
 * True when supply packs can be bought: they need only the key, since their price is set
 * here (plans.ts SUPPLY_PACKS) rather than as a Stripe price.
 */
export const packsReady = () => Boolean(read("STRIPE_SECRET_KEY"));

/** A pack's price in cents, as Stripe charges it. */
export const packCents = (pack: SupplyPack) => Math.round(SUPPLY_PACKS[pack].price * 100);

/** True when checkout can run: a key and all four prices are set. */
export function billingReady(): boolean {
  return Boolean(
    read("STRIPE_SECRET_KEY") &&
      (["pro", "agency"] as const).every((t) => priceId(t, "month") && priceId(t, "year")),
  );
}

let client: Stripe | undefined;

/** The Stripe client, on fetch so it runs on Cloudflare Workers. */
export function stripe(): Stripe {
  const key = read("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY isn't set.");
  client ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return client;
}

let portalConfigs: Promise<Partial<Record<PaidTier, string>>> | undefined;

/**
 * The customer portal settings for one plan, found by `metadata.garrison_tier` on the
 * account's portal configurations. Each lists only its own product's prices, so switching
 * between monthly and yearly can never turn Pro into Agency (the plan comes from the
 * subscription's metadata, not its price). Without one, the account's default portal
 * applies, which doesn't allow switching. See docs/pricing.md.
 */
export function portalConfiguration(tier: PaidTier): Promise<string | undefined> {
  portalConfigs ??= stripe()
    .billingPortal.configurations.list({ active: true, limit: 20 })
    .then((list) => {
      const found: Partial<Record<PaidTier, string>> = {};
      for (const c of list.data) {
        const t = c.metadata?.garrison_tier;
        if ((t === "pro" || t === "agency") && !found[t]) found[t] = c.id;
      }
      return found;
    })
    .catch((e) => {
      // Try again next time; the default portal still opens.
      portalConfigs = undefined;
      console.error("Stripe portal settings unavailable:", e instanceof Error ? e.message : e);
      return {};
    });
  return portalConfigs.then((found) => found[tier]);
}

/** Check a webhook's signature (Web Crypto, as Workers need) and parse the event. */
export async function verifyEvent(body: string, signature: string | null): Promise<Stripe.Event> {
  const secret = read("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET isn't set.");
  if (!signature) throw new Error("Missing Stripe-Signature.");
  return stripe().webhooks.constructEventAsync(
    body,
    signature,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}

let billingDb: Db | undefined;

/**
 * The webhook's own database login, garrison_billing: it can only call the billing
 * functions. Refuses any other login, so a mistaken URL can't widen what it may do.
 */
export async function getBillingDb(): Promise<Db> {
  const url = read("BILLING_DATABASE_URL");
  if (!url) throw new Error("BILLING_DATABASE_URL isn't set.");
  billingDb ??= createDb(url, { max: 1 }).db;
  const problem = roleProblem(await describeDbRole(billingDb), "garrison_billing");
  if (problem) throw new Error(problem.replace("DATABASE_URL", "BILLING_DATABASE_URL"));
  return billingDb;
}

/**
 * Apply a subscription's current state. Always called with the subscription as Stripe
 * has it now (fetched fresh), so events arriving out of order can't undo a newer state.
 */
export async function applySubscription(db: Db, sub: Stripe.Subscription) {
  const meta = readMetadata(sub.metadata);
  if (!meta) return "ignored" as const;
  const state = subscriptionState(sub);
  if (meta.tier === "pro") return setGuildBilling(db, meta.guildId as string, meta.userId, state);
  return setAgencyBilling(db, meta.userId, PRICING.agency.servers, state);
}

/**
 * A paid supply pack's Checkout Session: grant the pack, once. Only a session that's paid,
 * says it's a pack for a server, and charged that pack's price grants anything.
 */
export async function applySupplyPack(db: Db, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return "waiting" as const;
  const meta = session.metadata ?? {};
  const pack = meta.pack as SupplyPack;
  if (meta.kind !== "supplies" || !Object.hasOwn(SUPPLY_PACKS, pack) || !meta.guildId)
    return "ignored" as const;
  if (session.currency !== "usd" || session.amount_subtotal !== packCents(pack))
    return "ignored" as const;
  const intent = session.payment_intent;
  return grantSupplyPack(db, {
    sessionId: session.id,
    guildId: meta.guildId,
    pack,
    supplies: SUPPLY_PACKS[pack].supplies,
    amountCents: session.amount_total ?? packCents(pack),
    paymentIntent: typeof intent === "string" ? intent : (intent?.id ?? null),
    buyerId: meta.userId ?? null,
  });
}
