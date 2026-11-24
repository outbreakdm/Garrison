"use server";

import {
  addRosterCharacter,
  addRosterMember,
  checkCharacter,
  checkRosterNote,
  createRosterTeam,
  deleteRosterTeam,
  getGuildPlan,
  getRosterCharacter,
  isRosterStatus,
  listMemberTeams,
  memberNames,
  removeRosterCharacter,
  removeRosterMember,
  rosterCandidates,
  rosterGame,
  setMainCharacter,
  setRosterMember,
  updateRosterCharacter,
  updateRosterTeam,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { memberNames as discordNames, isGuildMember } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";

/**
 * The raid roster, edited by officers (editor access). Each action re-checks access for the
 * server in the form and only touches that server's teams, members and characters.
 */

const UUID = /^[0-9a-f-]{36}$/;
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

const back = (guildId: string, outcome: { ok: string } | { error: string }, anchor = "") =>
  flashBack(`/servers/${guildId}/rally`, outcome, `?tab=roster${anchor ? `#${anchor}` : ""}`);

async function load(form: FormData) {
  const access = await checkGuildAccess(text(form, "guildId"), "editor", "rally");
  if (!access) redirect("/servers");
  return { ...access, db: await getDb() };
}

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Someone the roster may hold, with their name: a raider or character owner here, someone already
 * on a team, or (`inServer`) anyone Discord says is in the server. Null for anyone else.
 */
async function rosterPerson(db: Db, guildId: string, userId: string, inServer = false) {
  const candidates = await rosterCandidates(db, guildId);
  const teams = candidates.has(userId) ? [] : await listMemberTeams(db, guildId, userId);
  if (!candidates.has(userId) && !teams.length) {
    if (!inServer || !(await isGuildMember(guildId, userId))) return null;
    return (await discordNames(guildId, [userId])).get(userId) ?? "";
  }
  return candidates.get(userId) || (await memberNames(db, guildId, [userId])).get(userId) || "";
}

export async function createTeam(form: FormData) {
  const { guild, db } = await load(form);
  const plan = await getGuildPlan(db, guild.id);
  const r = await createRosterTeam(db, guild.id, plan, {
    name: text(form, "name"),
    game: text(form, "game"),
  });
  if (!r.ok) return back(guild.id, { error: r.error });
  return back(guild.id, { ok: `Added ${r.value.name}.` }, `team-${r.value.id}`);
}

export async function saveTeam(form: FormData) {
  const { guild, db } = await load(form);
  const teamId = text(form, "teamId");
  if (!UUID.test(teamId)) return back(guild.id, { error: "That team is gone." });
  const r = await updateRosterTeam(db, guild.id, teamId, {
    name: text(form, "name"),
    game: text(form, "game"),
  });
  if (!r.ok) return back(guild.id, { error: r.error }, `team-${teamId}`);
  return back(guild.id, { ok: "Team saved." }, `team-${teamId}`);
}

export async function removeTeam(form: FormData) {
  const { guild, db } = await load(form);
  const teamId = text(form, "teamId");
  if (!UUID.test(teamId) || !(await deleteRosterTeam(db, guild.id, teamId)))
    return back(guild.id, { error: "That team is gone." });
  return back(guild.id, { ok: "Team deleted. Its members keep their characters." });
}

export async function addMember(form: FormData) {
  const { guild, db } = await load(form);
  const teamId = text(form, "teamId");
  const userId = text(form, "userId");
  const status = text(form, "status");
  if (!UUID.test(teamId) || !isSnowflake(userId) || !isRosterStatus(status))
    return back(guild.id, { error: "Pick someone to add." }, `team-${teamId}`);
  // Raiders and character owners here, or anyone found in the server with Find a member.
  const name = await rosterPerson(db, guild.id, userId, true);
  if (name === null) return back(guild.id, { error: "They aren't in this server." });
  const r = await addRosterMember(db, guild.id, teamId, { id: userId, name }, status);
  const outcome =
    r === "added"
      ? { ok: `Added ${name || "them"} to the team.` }
      : {
          error:
            r === "already"
              ? "They're already on this team."
              : r === "full"
                ? "This team is full."
                : "That team is gone.",
        };
  return back(guild.id, outcome, `team-${teamId}`);
}

export async function saveMember(form: FormData) {
  const { guild, db } = await load(form);
  const teamId = text(form, "teamId");
  const userId = text(form, "userId");
  const status = text(form, "status");
  const note = checkRosterNote(form.get("note"));
  if (!UUID.test(teamId) || !isSnowflake(userId) || !isRosterStatus(status))
    return back(guild.id, { error: "That member has changed. Refresh and try again." });
  if (!note.ok) return back(guild.id, { error: note.error }, `team-${teamId}`);
  const saved = await setRosterMember(db, guild.id, teamId, userId, { status, note: note.value });
  if (!saved) return back(guild.id, { error: "They're no longer on this team." }, `team-${teamId}`);
  return back(guild.id, { ok: "Saved." }, `member-${teamId}-${userId}`);
}

export async function removeMember(form: FormData) {
  const { guild, db } = await load(form);
  const teamId = text(form, "teamId");
  const userId = text(form, "userId");
  if (!UUID.test(teamId) || !isSnowflake(userId))
    return back(guild.id, { error: "That member has changed. Refresh and try again." });
  await removeRosterMember(db, guild.id, teamId, userId);
  return back(guild.id, { ok: "Removed from the team." }, `team-${teamId}`);
}

/** Adds a character for a member; officers can fill in a roster for people. */
export async function addCharacter(form: FormData) {
  const { guild, db } = await load(form);
  const userId = text(form, "userId");
  const anchor = text(form, "anchor").replace(/[^\w-]/g, "");
  if (!isSnowflake(userId)) return back(guild.id, { error: "Pick whose character it is." });
  const name = await rosterPerson(db, guild.id, userId);
  if (name === null) return back(guild.id, { error: "Put them on a team first." });
  const fields = checkCharacter(Object.fromEntries(form), await rosterGame(db, guild.id));
  if (!fields.ok) return back(guild.id, { error: fields.error }, anchor);
  const r = await addRosterCharacter(
    db,
    guild.id,
    { id: userId, name },
    fields.value,
    form.get("main") === "on",
  );
  if (!r.ok) return back(guild.id, { error: r.error }, anchor);
  return back(guild.id, { ok: `Added ${r.value.name}.` }, anchor);
}

export async function saveCharacter(form: FormData) {
  const { guild, db } = await load(form);
  const id = text(form, "characterId");
  const anchor = text(form, "anchor").replace(/[^\w-]/g, "");
  if (!UUID.test(id)) return back(guild.id, { error: "That character is gone." });
  const fields = checkCharacter(Object.fromEntries(form), await rosterGame(db, guild.id));
  if (!fields.ok) return back(guild.id, { error: fields.error }, anchor);
  const r = await updateRosterCharacter(db, guild.id, id, fields.value);
  if (!r.ok) return back(guild.id, { error: r.error }, anchor);
  if (form.get("main") === "on" && !r.value.main) await setMainCharacter(db, guild.id, id);
  return back(guild.id, { ok: `Saved ${r.value.name}.` }, anchor);
}

export async function removeCharacter(form: FormData) {
  const { guild, db } = await load(form);
  const id = text(form, "characterId");
  const anchor = text(form, "anchor").replace(/[^\w-]/g, "");
  const current = UUID.test(id) ? await getRosterCharacter(db, guild.id, id) : null;
  if (!current || !(await removeRosterCharacter(db, guild.id, id)))
    return back(guild.id, { error: "That character is gone." }, anchor);
  return back(guild.id, { ok: `Removed ${current.name}.` }, anchor);
}
