"use server";

import { isStaff, setComp } from "@garrison/db";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isSnowflake } from "@/lib/security";
import { getSession } from "@/lib/session";

/**
 * Staff only: give a server Pro for free or put it back on Free, from the staff
 * page. A public POST endpoint, so it checks the session and staff here; the
 * database checks staff again and never touches a plan someone pays for.
 */
export async function staffCompAction(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fstaff");
  const db = await getDb();
  if (!(await isStaff(db, session.userId))) notFound();
  const guildId = String(form.get("guildId") ?? "");
  if (!isSnowflake(guildId)) redirect("/staff");
  const comp = form.get("comp") === "on";
  const note = String(form.get("note") ?? "").slice(0, 200) || null;
  const result = await setComp(db, session.userId, guildId, comp, note);
  redirect(`/staff?done=${result}#g-${guildId}`);
}
