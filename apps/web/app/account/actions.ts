"use server";

import {
  cleanRankDetails,
  eraseMyData,
  listAgencyPlans,
  removeLink,
  saveRankDetails,
  setRosterShare,
  signOutElsewhere,
} from "@garrison/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { billingReady, portalConfiguration, stripe } from "@/lib/billing";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { rankDetailsForms } from "@/lib/rank-details";
import { isSnowflake } from "@/lib/security";
import { getSession, SESSION_COOKIE } from "@/lib/session";

/**
 * The Account page's actions. Server Actions are public POST endpoints, so each one reads the
 * session itself, and every query is scoped to the signed-in user's own ID, never one from the
 * form.
 */

async function me() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  return session;
}

export async function removeAccountLink(form: FormData) {
  const session = await me();
  const id = String(form.get("linkId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/account?error=invalid");
  const removed = await removeLink(await getDb(), session.userId, id);
  redirect(removed ? "/account?removed=1" : "/account?error=invalid");
}

export async function stopSharing(form: FormData) {
  const session = await me();
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/account?tab=servers&error=invalid");
  await setRosterShare(await getDb(), guildId, session.userId, session.username, false);
  redirect("/account?tab=servers&unshared=1");
}

/**
 * A member's own rank card details in one server. Only for a server where they
 * have XP and are a member, and only the fields that server's card asks for.
 */
export async function saveMyRankDetails(form: FormData) {
  const session = await me();
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/account?tab=servers&error=invalid");
  const [target] = await rankDetailsForms(session.userId, guildId);
  if (!target) redirect("/account?tab=servers&error=invalid");
  const raw = Object.fromEntries(target.fields.map((f) => [f.id, form.get(`f_${f.id}`) ?? ""]));
  await saveRankDetails(
    await getDb(),
    guildId,
    session.userId,
    cleanRankDetails(target.fields, raw),
  );
  redirect("/account?tab=servers&rank=saved");
}

/** End every other sign-in; this browser stays signed in. */
export async function signOutOthers() {
  const session = await me();
  await signOutElsewhere(await getDb(), session.userId, session.tokenHash);
  redirect("/account?tab=data&signedout=others");
}

/**
 * Erase what the person controls: links (wiped, not just hidden), shares, rank card details,
 * and every sign-in, this one included. Asked twice on the page ("Erase…", then "Yes, erase
 * it"); the form also has to carry the word, so a stray POST can't do it.
 */
export async function eraseMine(form: FormData) {
  const session = await me();
  if (form.get("confirm") !== "erase") redirect("/account?tab=data&error=invalid#erase");
  await eraseMyData(await getDb(), session.userId);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?done=erased");
}

/** Stripe's billing portal for an Agency plan this person pays for. */
export async function agencyBilling() {
  const session = await me();
  if (!billingReady()) redirect("/account?tab=billing&error=billing");
  const plan = (await listAgencyPlans(await getDb(), session.userId)).find(
    (a) => a.source === "stripe" && a.stripeCustomerId,
  );
  if (!plan?.stripeCustomerId) redirect("/account?tab=billing&error=invalid");
  let url: string | null = null;
  try {
    const configuration = await portalConfiguration("agency");
    const portal = await stripe().billingPortal.sessions.create({
      customer: plan.stripeCustomerId,
      return_url: `${env().APP_URL}/account?tab=billing`,
      ...(configuration ? { configuration } : {}),
    });
    url = portal.url;
  } catch (e) {
    console.error("Stripe portal refused:", e instanceof Error ? e.message : e);
  }
  redirect(url ?? "/account?tab=billing&error=billing");
}
