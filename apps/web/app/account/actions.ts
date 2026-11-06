"use server";

import { removeLink, setRosterShare } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isSnowflake } from "@/lib/security";
import { getSession } from "@/lib/session";

/** Members manage only their own links and shares: every query is scoped to the signed-in user's ID. */

export async function removeAccountLink(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const id = String(form.get("linkId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/account?error=invalid");
  const removed = await removeLink(getDb(), session.userId, id);
  redirect(removed ? "/account?removed=1" : "/account?error=invalid");
}

export async function stopSharing(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/account?error=invalid");
  await setRosterShare(getDb(), guildId, session.userId, session.username, false);
  redirect("/account?unshared=1");
}
