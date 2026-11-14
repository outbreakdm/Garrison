"use server";

import {
  assignSeat,
  getPlanDetails,
  isStaff,
  listAgencyPlans,
  releaseSeat,
  setComp,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { billingReady, type Interval, type PaidTier, priceId, stripe } from "@/lib/billing";
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
  const access = await checkGuildAccess(guildId);
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
  const access = await checkGuildAccess(guildId);
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
  const access = await checkGuildAccess(guildId);
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
  if (!session.url) redirect(`${back}?done=checkout_failed`);
  redirect(session.url);
}

/**
 * Manage billing: Stripe's customer portal for whoever pays, to change card, switch
 * between monthly and yearly, see invoices or cancel. Only the payer gets a link.
 */
export async function portalAction(form: FormData) {
  const guildId = String(form.get("guildId") ?? "");
  const access = await checkGuildAccess(guildId);
  if (!access) redirect("/servers");
  const back = `/servers/${access.guild.id}/plan`;
  if (!billingReady()) redirect(back);
  const db = await getDb();
  const user = access.session.userId;
  const [details, agency] = await Promise.all([
    getPlanDetails(db, access.guild.id),
    listAgencyPlans(db, user),
  ]);
  const customer =
    form.get("for") === "agency"
      ? agency.find((a) => a.source === "stripe")?.stripeCustomerId
      : details.paidBy === user
        ? details.stripeCustomerId
        : null;
  if (!customer) redirect(`${back}?done=not_payer`);
  const portal = await stripe().billingPortal.sessions.create({
    customer,
    return_url: `${env().APP_URL}${back}`,
  });
  redirect(portal.url);
}
