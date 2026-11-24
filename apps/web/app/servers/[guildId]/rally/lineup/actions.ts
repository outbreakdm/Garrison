"use server";

import {
  checkGroups,
  deleteLineupLayout,
  getLineupLayout,
  getOpsEvent,
  listSignups,
  type Placement,
  queueDashboardAction,
  saveLineup,
  saveLineupLayout,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { wakeBot } from "@/lib/bot";
import { getDb } from "@/lib/db";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * An organized raid's lineup, edited by officers (editor access). Every action re-checks access
 * for the server in the form, and the raid must be that server's. The lineup itself is checked
 * again when it's saved (packages/db lineups.ts).
 */

const UUID = /^[0-9a-f-]{36}$/;
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

async function load(form: FormData) {
  const access = await checkGuildAccess(text(form, "guildId"), "editor", "rally");
  if (!access) redirect("/servers");
  const eventId = text(form, "eventId");
  const db = await getDb();
  const event = UUID.test(eventId) ? await getOpsEvent(db, access.guild.id, eventId) : null;
  if (!event) redirect(`/servers/${access.guild.id}/rally?tab=raids`);
  const back = (outcome: { ok: string } | { error: string }) =>
    flashBack(`/servers/${access.guild.id}/rally/lineup/${event.id}`, outcome);
  return { ...access, db, event, back };
}

/** The board's places: { userId: group number, "bench" or null }. Anything else is dropped. */
function readPlaces(raw: string) {
  const out = new Map<string, Placement>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;
  for (const [userId, place] of Object.entries(parsed as Record<string, unknown>).slice(0, 300)) {
    if (!/^\d{17,20}$/.test(userId)) continue;
    if (
      place === null ||
      place === "bench" ||
      (typeof place === "number" && Number.isInteger(place))
    )
      out.set(userId, place);
  }
  return out;
}

export async function saveLineupAction(form: FormData) {
  const { session, guild, db, event, back } = await load(form);
  const groups = checkGroups({ count: form.get("count"), size: form.get("size") });
  if (!groups) return back({ error: "Use 1 to 10 groups of 1 to 10 players." });
  const saved = await saveLineup(db, guild.id, event.id, groups, readPlaces(text(form, "places")));
  if (!saved.ok) return back({ error: saved.error });
  if (form.get("post") !== "1") return back({ ok: "Lineup saved." });
  const queued = await queueDashboardAction(
    db,
    guild.id,
    { id: session.userId, name: session.username },
    { kind: "post_lineup", payload: { eventId: event.id } },
  );
  wakeBot();
  if (!queued.ok)
    return back({ error: "Saved, but posting is busy. Try Save and post again in a minute." });
  return back({ ok: "Saved. Garrison posts the lineup in a few seconds." });
}

export async function saveLayoutAction(form: FormData) {
  const { guild, db, event, back } = await load(form);
  const r = await saveLineupLayout(db, guild.id, event.id, form.get("name"));
  return back(r.ok ? { ok: `Saved the lineup as ${r.value}.` } : { error: r.error });
}

/** Puts members who answered this raid where a saved lineup had them; the rest aren't placed. */
export async function applyLayoutAction(form: FormData) {
  const { guild, db, event, back } = await load(form);
  const id = text(form, "layoutId");
  const layout = UUID.test(id) ? await getLineupLayout(db, guild.id, id) : null;
  if (!layout) return back({ error: "That saved lineup is gone." });
  const was = new Map(layout.places.map((p) => [p.userId, p.group]));
  const places = new Map<string, Placement>();
  for (const s of await listSignups(db, event.id)) {
    if (s.availability === "cant") continue;
    const group = was.get(s.userId);
    places.set(s.userId, group === undefined ? null : group === 0 ? "bench" : group);
  }
  const saved = await saveLineup(db, guild.id, event.id, layout.groups, places);
  if (!saved.ok) return back({ error: saved.error });
  return back({ ok: `Used ${layout.name}. Check it, then save and post.` });
}

export async function deleteLayoutAction(form: FormData) {
  const { guild, db, back } = await load(form);
  const id = text(form, "layoutId");
  const gone = UUID.test(id) && (await deleteLineupLayout(db, guild.id, id));
  return back(gone ? { ok: "Deleted the saved lineup." } : { error: "That saved lineup is gone." });
}
