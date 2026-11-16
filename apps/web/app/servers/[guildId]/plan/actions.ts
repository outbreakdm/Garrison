"use server";

import {
  assignSeat,
  getPlanDetails,
  isStaff,
  listAgencyPlans,
  releaseSeat,
  SUPPLY_PACK_DAYS,
  SUPPLY_PACKS,
  type SupplyPack,
  setComp,
} from "@garrison/db";
import { redirect } from "next/navigation";
import {
  billingReady,
  type Interval,
  type PaidTier,
  packCents,
  packsReady,
  portalConfiguration,
  priceId,
  stripe,
} from "@/lib/billing";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { checkGuildAccess } from "@/lib/session";

/**
 * Staff only: give this server Pro for free, or take a free Pro away. The page
 * hides the form from everyone else, but this is a public POST endpoint, so it
 * re-checks access and staff here, and the database checks staff once more.
 */
export async function setCompAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) redirect("/servers");
  const db = await getDb();
  const back = `/servers/${access.guild.id}/plan`;
  if (!(await isStaff(db, access.session.userId))) redirect(back);
  const comp = form.get("comp") === "on";
  const note = String(form.get("note") ?? "").slice(0, 200) || null;
  const result = await setComp(db, access.session.userId, access.guild.id, comp, note);
  redirect(`${back}?done=${result}`);
}

/**
 * An Agency plan's owner puts this server in one of their seats, or frees its seat.
 * Checks here that the signed-in person manages the server; the database checks that
 * they own the plan and that a seat is free.
 */
export async function seatAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) redirect("/servers");
  const back = `/servers/${access.guild.id}/plan`;
  const db = await getDb();
  const op = String(form.get("op") ?? "");
  if (op === "release") {
    const result = await releaseSeat(db, access.session.userId, access.guild.id);
    redirect(`${back}?done=seat_${result}`);
  }
  const bundleId = String(form.get("bundleId") ?? "");
  if (op !== "assign" || !/^[0-9a-f-]{36}$/.test(bundleId)) redirect(back);
  const result = await assignSeat(db, access.session.userId, bundleId, access.guild.id);
  redirect(`${back}?done=seat_${result}`);
}

/**
 * Upgrade: open Stripe Checkout for Pro on this server, or for an Agency plan for the
 * signed-in person. The subscription carries who bought it and for which server; the
 * webhook turns Pro on once Stripe confirms payment, never this action.
 */
export async function checkoutAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) redirect("/servers");
  const back = `/servers/${access.guild.id}/plan`;
  const tier = String(form.get("tier") ?? "") as PaidTier;
  const interval = String(form.get("interval") ?? "") as Interval;
  if (!billingReady() || !["pro", "agency"].includes(tier) || !["month", "year"].includes(interval))
    redirect(back);
  const price = priceId(tier, interval);
  if (!price) redirect(back);
  const db = await getDb();
  if (tier === "pro") {
    const current = await getPlanDetails(db, access.guild.id);
    if (current.plan === "pro" && current.source === "stripe")
      redirect(`${back}?done=already_paid`);
  }
  const user = access.session.userId;
  const metadata: Record<string, string> =
    tier === "pro" ? { tier, userId: user, guildId: access.guild.id } : { tier, userId: user };
  const base = env().APP_URL;
  // A refused session (a product setting missing in Stripe, say) shows a notice, not a
  // crashed page. redirect() throws, so it stays outside the try.
  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user,
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: true,
      // Tags these sessions in the Stripe dashboard, to compare checkout flows over time.
      integration_identifier: "garrison_plans_qhwkzmtr",
      success_url: `${base}${back}?done=checkout`,
      cancel_url: `${base}${back}`,
    });
    url = session.url;
  } catch (e) {
    console.error("Stripe checkout refused:", e instanceof Error ? e.message : e);
  }
  if (!url) redirect(`${back}?done=checkout_failed`);
  redirect(url);
}

/**
 * Buy a supply pack for this server: a one-time Stripe Checkout. The session says which
 * server and pack; the webhook adds the supplies once Stripe confirms the payment, never
 * this action. Anyone who manages the server can buy one, on any plan.
 */
export async function buySuppliesAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) redirect("/servers");
  const back = `/servers/${access.guild.id}/plan`;
  const pack = String(form.get("pack") ?? "") as SupplyPack;
  if (!packsReady() || !Object.hasOwn(SUPPLY_PACKS, pack)) redirect(`${back}#supplies`);
  const user = access.session.userId;
  const metadata = { kind: "supplies", pack, guildId: access.guild.id, userId: user };
  const supplies = SUPPLY_PACKS[pack].supplies.toLocaleString("en-US");
  const base = env().APP_URL;
  let url: string | null = null;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: packCents(pack),
            product_data: {
              name: `${supplies} AI assistant supplies`,
              description: `For the Garrison AI assistant on ${access.guild.name.slice(0, 60)}, used after its monthly supplies run out. They last ${SUPPLY_PACK_DAYS / 365} year.`,
            },
          },
        },
      ],
      client_reference_id: user,
      metadata,
      payment_intent_data: { metadata },
      // Tags these sessions in the Stripe dashboard, apart from plan checkouts.
      integration_identifier: "garrison_supplies_vqhtmzkd",
      success_url: `${base}${back}?done=supplies#supplies`,
      cancel_url: `${base}${back}#supplies`,
    });
    url = session.url;
  } catch (e) {
    console.error("Stripe checkout refused:", e instanceof Error ? e.message : e);
  }
  if (!url) redirect(`${back}?done=checkout_failed#supplies`);
  redirect(url);
}

/**
 * Manage billing: Stripe's customer portal for whoever pays, to change card, switch
 * between monthly and yearly, see invoices or cancel. Only the payer gets a link.
 */
export async function portalAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId, "manager");
  if (!access) redirect("/servers");
  const back = `/servers/${access.guild.id}/plan`;
  if (!billingReady()) redirect(back);
  const db = await getDb();
  const user = access.session.userId;
  const [details, agency] = await Promise.all([
    getPlanDetails(db, access.guild.id),
    listAgencyPlans(db, user),
  ]);
  const tier: PaidTier = form.get("for") === "agency" ? "agency" : "pro";
  const customer =
    tier === "agency"
      ? agency.find((a) => a.source === "stripe")?.stripeCustomerId
      : details.paidBy === user
        ? details.stripeCustomerId
        : null;
  if (!customer) redirect(`${back}?done=not_payer`);
  let url: string | null = null;
  try {
    // This plan's own portal: it switches monthly and yearly within the plan only.
    const configuration = await portalConfiguration(tier);
    const portal = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${env().APP_URL}${back}`,
      ...(configuration ? { configuration } : {}),
    });
    url = portal.url;
  } catch (e) {
    console.error("Stripe portal refused:", e instanceof Error ? e.message : e);
  }
  if (!url) redirect(`${back}?done=portal_failed`);
  redirect(url);
}
