"use server";

import { assignSeat, isStaff, releaseSeat, setComp } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
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
