"use server";

import {
  ACCESS_AREAS,
  ACCESS_SWITCHES,
  type AccessGroup,
  type AccessGroupMember,
  applySettingsChange,
  checkAccessGroups,
  entitlements,
  getDashboardAccess,
  getGuildPlan,
  isAccessArea,
  isAccessSwitch,
  newId,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { fetchMemberCard, listGuildRoles } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isSnowflake } from "@/lib/security";
import { checkGuildAccess } from "@/lib/session";

/**
 * Access groups, managed by managers only (Manage Server, checked live): make a group, choose
 * its areas and switches, add or remove its people and roles, delete it. Each change saves the
 * whole list through applySettingsChange, so it's in Settings history with Undo (managers only).
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

async function load(form: FormData) {
  const access = await checkGuildAccess(text(form, "guildId"), "manager");
  if (!access) redirect("/servers");
  const db = await getDb();
  const [{ groups }, plan] = await Promise.all([
    getDashboardAccess(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  const back = (outcome: { ok: string } | { error: string }, anchor = "groups") =>
    flashBack(`/servers/${access.guild.id}/settings`, outcome, `?tab=access#${anchor}`);
  const save = async (next: AccessGroup[], ok: string, anchor = "groups") => {
    // Checked with the plan's number of groups only when adding, so a downgrade never locks editing.
    const limit = Math.max(entitlements(plan)["access.groups"], groups.length);
    const checked = checkAccessGroups(next, limit);
    if (!checked.ok) return back({ error: checked.error }, anchor);
    const result = await applySettingsChange(db, {
      guildId: access.guild.id,
      module: "access",
      patch: { groups: checked.value },
      userId: access.session.userId,
      username: access.session.username,
    });
    if (!result.ok)
      return back(
        { error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute." },
        anchor,
      );
    return back({ ok }, anchor);
  };
  return { ...access, db, plan, groups, back, save };
}

export async function createGroup(form: FormData) {
  const { plan, groups, back, save } = await load(form);
  const limit = entitlements(plan)["access.groups"];
  if (groups.length >= limit)
    return back({
      error:
        plan === "free"
          ? `Free servers have ${limit} access groups. Garrison Pro allows 15.`
          : `A server can have ${limit} access groups.`,
    });
  const name = text(form, "name").trim().replace(/\s+/g, " ");
  const id = newId();
  return save(
    [...groups, { id, name, areas: {}, switches: [], members: [] }],
    `Made ${name}. Pick what it can open, then add people.`,
    `group-${id}`,
  );
}

/** Saves a group's name, its areas (None, View or Edit each) and its switches. */
export async function saveGroup(form: FormData) {
  const { groups, back, save } = await load(form);
  const id = text(form, "groupId");
  const group = groups.find((g) => g.id === id);
  if (!group) return back({ error: "That group is gone." });
  const areas: AccessGroup["areas"] = {};
  for (const area of Object.keys(ACCESS_AREAS)) {
    const level = text(form, `area_${area}`);
    if (isAccessArea(area) && (level === "view" || level === "edit")) areas[area] = level;
  }
  const switches = Object.keys(ACCESS_SWITCHES).filter(
    (s) => isAccessSwitch(s) && form.get(`switch_${s}`) === "on",
  ) as AccessGroup["switches"];
  const name = text(form, "name").trim().replace(/\s+/g, " ");
  return save(
    groups.map((g) => (g.id === id ? { ...g, name, areas, switches } : g)),
    `Saved ${name}.`,
    `group-${id}`,
  );
}

export async function deleteGroup(form: FormData) {
  const { groups, back, save } = await load(form);
  const id = text(form, "groupId");
  const group = groups.find((g) => g.id === id);
  if (!group) return back({ error: "That group is gone." });
  return save(
    groups.filter((g) => g.id !== id),
    `Deleted ${group.name}. Its people keep any other access they have.`,
  );
}

/** Adds a person (one found by name) or a role from this server to a group. */
export async function addGroupMember(form: FormData) {
  const { guild, groups, back, save } = await load(form);
  const groupId = text(form, "groupId");
  const kind = text(form, "kind");
  const id = text(form, "id");
  const group = groups.find((g) => g.id === groupId);
  if (!group) return back({ error: "That group is gone." });
  const anchor = `group-${groupId}`;
  if ((kind !== "user" && kind !== "role") || !isSnowflake(id))
    return back({ error: "Pick a person or a role from this server." }, anchor);
  let member: AccessGroupMember;
  if (kind === "user") {
    const card = await fetchMemberCard(guild.id, id).catch(() => null);
    if (!card?.joinedAt) return back({ error: "They aren't in this server." }, anchor);
    if (card.bot) return back({ error: "Bots can't use the dashboard." }, anchor);
    member = { kind, id, name: card.name };
  } else {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    if (!roles) return back({ error: "Discord didn't answer. Try again." }, anchor);
    const role = roles.find((r) => r.id === id);
    if (!role || role.id === guild.id || role.managed)
      return back(
        { error: "Pick a role from this server (not @everyone or a bot's role)." },
        anchor,
      );
    member = { kind, id, name: role.name };
  }
  if (group.members.some((m) => m.kind === kind && m.id === id))
    return back({ error: "They're already in this group." }, anchor);
  return save(
    groups.map((g) => (g.id === groupId ? { ...g, members: [...g.members, member] } : g)),
    `Added ${kind === "role" ? `everyone with @${member.name}` : member.name} to ${group.name}.`,
    anchor,
  );
}

export async function removeGroupMember(form: FormData) {
  const { groups, back, save } = await load(form);
  const groupId = text(form, "groupId");
  const kind = text(form, "kind");
  const id = text(form, "id");
  const group = groups.find((g) => g.id === groupId);
  if (!group) return back({ error: "That group is gone." });
  return save(
    groups.map((g) =>
      g.id === groupId
        ? { ...g, members: g.members.filter((m) => !(m.kind === kind && m.id === id)) }
        : g,
    ),
    `Removed them from ${group.name}.`,
    `group-${groupId}`,
  );
}
