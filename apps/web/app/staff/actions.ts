"use server";

import { isStaff, removeAgencyComp, setAgencyComp, setComp } from "@garrison/db";
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

/**
 * Staff only: give a Discord user a complimentary Agency plan (Pro on up to N servers
 * they run), resize it, or remove it. The database checks staff again.
 */
export async function staffAgencyAction(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fstaff");
  const db = await getDb();
  if (!(await isStaff(db, session.userId))) notFound();
  if (form.get("op") === "remove") {
    const bundleId = String(form.get("bundleId") ?? "");
    if (/^[0-9a-f-]{36}$/.test(bundleId)) await removeAgencyComp(db, session.userId, bundleId);
    redirect("/staff?done=agency_removed#agency");
  }
  const ownerId = String(form.get("ownerId") ?? "").trim();
  const seats = Number(form.get("seats") ?? 5);
  if (!isSnowflake(ownerId) || !Number.isInteger(seats) || seats < 1 || seats > 25)
    redirect("/staff?done=agency_bad#agency");
  const note = String(form.get("note") ?? "").slice(0, 200) || null;
  await setAgencyComp(db, session.userId, ownerId, seats, note);
  redirect("/staff?done=agency#agency");
}
