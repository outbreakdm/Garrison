"use server";

import { cleanRankDetails, removeLink, saveRankDetails, setRosterShare } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { rankDetailsForms } from "@/lib/rank-details";
import { isSnowflake } from "@/lib/security";
import { getSession } from "@/lib/session";

/** Members manage only their own links and shares: every query is scoped to the signed-in user's ID. */

export async function removeAccountLink(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const id = String(form.get("linkId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/account?error=invalid");
  const removed = await removeLink(await getDb(), session.userId, id);
  redirect(removed ? "/account?removed=1" : "/account?error=invalid");
}

export async function stopSharing(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/account?error=invalid");
  await setRosterShare(await getDb(), guildId, session.userId, session.username, false);
  redirect("/account?unshared=1");
}

/**
 * A member's own rank card details in one server. Only for a server where they
 * have XP and are a member, and only the fields that server's card asks for.
 */
export async function saveMyRankDetails(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/account?error=invalid");
  const [target] = await rankDetailsForms(session.userId, guildId);
  if (!target) redirect("/account?error=invalid");
  const raw = Object.fromEntries(target.fields.map((f) => [f.id, form.get(`f_${f.id}`) ?? ""]));
  await saveRankDetails(
    await getDb(),
    guildId,
    session.userId,
    cleanRankDetails(target.fields, raw),
  );
  redirect("/account?rank=saved#rank-cards");
}
