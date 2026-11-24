import "server-only";
import {
  type Db,
  getOpsEvent,
  isAvailability,
  listRosterCharacters,
  type QueueInput,
  slotFor,
} from "@garrison/db";

/**
 * A member's answer to an organized raid, from a form, checked before it goes to the bot (which
 * checks again): the raid is organized and scheduled, the character is their own, and the role
 * (theirs, or the character's) is one the raid has. Null when any of that fails.
 */
export async function raidAnswer(
  db: Db,
  guildId: string,
  userId: string,
  form: FormData,
): Promise<QueueInput | null> {
  const eventId = String(form.get("eventId") ?? "");
  const availability = String(form.get("availability") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(eventId) || !isAvailability(availability)) return null;
  const event = await getOpsEvent(db, guildId, eventId);
  if (event?.status !== "scheduled" || event.style !== "organized") return null;
  const characterId = String(form.get("characterId") ?? "") || null;
  const character = characterId
    ? (await listRosterCharacters(db, guildId, [userId])).find((c) => c.id === characterId)
    : null;
  if (characterId && !character) return null;
  const role = slotFor(event.slots, String(form.get("role") ?? "") || character?.role);
  if (availability !== "cant" && !role) return null;
  return {
    kind: "raid_answer",
    payload: { eventId: event.id, availability, characterId: character?.id ?? null, role },
  };
}
