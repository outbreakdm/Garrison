"use server";

import {
  disconnectTwitchSubs,
  entitlements,
  followsTwitch,
  getGuildPlan,
  getTwitchSubRole,
  setTwitchSubRoleId,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGuildRoles } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";
import { unsubscribeTwitchEvents } from "@/lib/twitch";

/** Twitch subscriber roles: pick the role, or disconnect. Managers only, Pro to change the role. */

const back = (guildId: string, outcome: { ok: string } | { error: string }) =>
  flashBack(`/servers/${guildId}/beacon`, outcome, "#sub-roles");

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "manager");
  if (!access) redirect("/servers");
  return { ...access, db: await getDb() };
}

export async function saveSubRole(form: FormData) {
  const { guild, db } = await load(form);
  if (!entitlements(await getGuildPlan(db, guild.id))["alerts.subRoles"])
    return back(guild.id, { error: "Subscriber roles are part of Garrison Pro." });
  if (!(await getTwitchSubRole(db, guild.id)))
    return back(guild.id, { error: "Connect the Twitch channel first." });
  const roleId = String(form.get("roleId") ?? "") || null;
  if (roleId) {
    const roles = await listGuildRoles(guild.id).catch(() => null);
    if (!roles) return back(guild.id, { error: "Discord didn't answer. Try again." });
    const role = roles.find((r) => r.id === roleId);
    if (!role) return back(guild.id, { error: "Pick a role from this server's list." });
    if (role.managed || isDangerousRole(role.permissions))
      return back(guild.id, {
        error: `@${role.name} has moderation or admin powers, or belongs to a bot, so subscribers can't get it.`,
      });
  }
  await setTwitchSubRoleId(db, guild.id, roleId);
  return back(guild.id, {
    ok: roleId
      ? "Saved. Subscribers who link Twitch get it within a few minutes."
      : "Saved. Nobody gets a subscriber role now; members who have it keep it until you remove it.",
  });
}

export async function disconnectSubRole(form: FormData) {
  const { guild, db } = await load(form);
  const was = await disconnectTwitchSubs(db, guild.id);
  // Twitch stops sending webhooks for a streamer no server follows any more.
  if (was && !(await followsTwitch(db, was))) await unsubscribeTwitchEvents(was).catch(() => null);
  return back(guild.id, {
    ok: "Disconnected. Garrison stops giving the role; members who have it keep it until you remove it.",
  });
}
