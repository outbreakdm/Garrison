"use server";

import { randomBytes } from "node:crypto";
import {
  applySettingsChange,
  entitlements,
  getGuildPlan,
  getOpsEvent,
  listSignups,
  type QueueInput,
  queueDashboardAction,
  setCalendarToken,
  setRaidAttendance,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { wakeBot } from "@/lib/bot";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { callSignupsForm, createRaidForm, moveSignupForm } from "@/lib/rally-schema";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";
import { pick } from "@/lib/settings-schema";

/**
 * Rally requests from the dashboard. These only queue work: the bot does it,
 * after checking it all again. Each action re-checks access for the server
 * named in the form, because that value comes from the browser.
 */

const back = (guildId: string, query: Record<string, string>) =>
  redirect(`/servers/${guildId}/rally?${new URLSearchParams(query)}`);

async function authorize(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  return access;
}

async function queue(form: FormData, input: QueueInput) {
  const { session, guild } = await authorize(form);
  const result = await queueDashboardAction(
    await getDb(),
    guild.id,
    { id: session.userId, name: session.username },
    input,
  );
  wakeBot();
  if (!result.ok) back(guild.id, { error: result.reason });
  back(guild.id, { queued: input.kind });
}

/** The event must be a scheduled raid in this server. */
async function eventBelongs(guildId: string, eventId: string) {
  const event = await getOpsEvent(await getDb(), guildId, eventId);
  return event?.status === "scheduled" ? event : null;
}

/**
 * The calendar feed: make a link (or a new one, which cuts off the old) or turn
 * it off. Saved directly: there's nothing for Garrison to do in Discord.
 */
export async function setCalendarFeed(form: FormData) {
  const { guild } = await authorize(form);
  const on = form.get("feed") !== "off";
  await setCalendarToken(
    await getDb(),
    guild.id,
    on ? randomBytes(24).toString("base64url") : null,
  );
  redirect(`/servers/${guild.id}/rally?calendar=${on ? "on" : "off"}#calendar`);
}

const toAttendance = (guildId: string, query: Record<string, string>) =>
  redirect(`/servers/${guildId}/rally?${new URLSearchParams(query)}#attendance`);

/** Track attendance from voice (Pro). A server back on Free can still turn it off. */
export async function saveAttendance(form: FormData) {
  const { session, guild } = await authorize(form);
  const db = await getDb();
  const on = form.get("trackAttendance") === "on";
  if (on && !entitlements(await getGuildPlan(db, guild.id))["ops.attendance"])
    toAttendance(guild.id, { error: "pro" });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "ops",
    patch: { trackAttendance: on },
    userId: session.userId,
    username: session.username,
  });
  toAttendance(guild.id, result.ok ? { attendance: "saved" } : { error: "invalid" });
}

/** Staff correct one mark on a raid that has started (Pro). */
export async function markAttendance(form: FormData) {
  const { guild } = await authorize(form);
  const db = await getDb();
  if (!entitlements(await getGuildPlan(db, guild.id))["ops.attendance"])
    toAttendance(guild.id, { error: "pro" });
  const eventId = String(form.get("eventId") ?? "");
  const userId = String(form.get("userId") ?? "");
  const mark = String(form.get("mark") ?? "");
  const value = mark === "yes" ? true : mark === "no" ? false : undefined;
  const ok =
    value !== undefined &&
    /^[0-9a-f-]{36}$/.test(eventId) &&
    isSnowflake(userId) &&
    (await setRaidAttendance(db, guild.id, eventId, userId, value));
  toAttendance(guild.id, ok ? { attendance: "marked" } : { error: "not_found" });
}

export async function requestCreateRaid(form: FormData) {
  const { guild } = await authorize(form);
  const keys = ["channelId", "title", "date", "time", "roles", "note", "repeatWeekly"];
  const parsed = createRaidForm.safeParse(pick(form, keys));
  if (!parsed.success) back(guild.id, { error: "invalid" });
  else {
    const channels = await listTextChannels(guild.id).catch(() => []);
    if (!channels.some((c) => c.id === parsed.data.channelId)) back(guild.id, { error: "channel" });
    else await queue(form, { kind: "create_raid", payload: parsed.data });
  }
}

export async function requestMoveSignup(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = moveSignupForm.safeParse(pick(form, ["eventId", "userId", "role"]));
  if (!parsed.success) back(guild.id, { error: "invalid" });
  else {
    const event = await eventBelongs(guild.id, parsed.data.eventId);
    const benched = event
      ? (await listSignups(await getDb(), event.id)).some(
          (s) => s.userId === parsed.data.userId && s.bench,
        )
      : false;
    if (!event || !benched || !event.slots.some((g) => g.name === parsed.data.role))
      back(guild.id, { error: "not_found" });
    else await queue(form, { kind: "move_signup", payload: parsed.data });
  }
}

export async function requestCallSignups(form: FormData) {
  const { guild } = await authorize(form);
  const parsed = callSignupsForm.safeParse(pick(form, ["eventId"]));
  if (!parsed.success || !(await eventBelongs(guild.id, parsed.data.eventId)))
    back(guild.id, { error: "not_found" });
  else await queue(form, { kind: "call_signups", payload: parsed.data });
}
