"use server";

import { applySettingsChange } from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/**
 * Fun extras (packages/db fun.ts): birthdays and counting. Re-checks access, keeps channels and
 * the role to this server's (never a role with moderation powers), and saves with history.
 */
export async function saveFun(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/fun`, outcome, "#settings");
  const patch = {
    birthdaysEnabled: form.get("birthdaysEnabled") === "on",
    birthdayChannelId: String(form.get("birthdayChannelId") ?? "") || null,
    birthdayRoleId: String(form.get("birthdayRoleId") ?? "") || null,
    countingEnabled: form.get("countingEnabled") === "on",
    countingChannelId: String(form.get("countingChannelId") ?? "") || null,
  };
  if (patch.birthdaysEnabled && !patch.birthdayChannelId)
    return back({ error: "Pick the channel birthday greetings go to." });
  if (patch.countingEnabled && !patch.countingChannelId)
    return back({ error: "Pick the counting channel." });
  const [channels, roles] = await Promise.all([
    listTextChannels(guild.id).catch(() => null),
    patch.birthdayRoleId ? listGuildRoles(guild.id).catch(() => null) : [],
  ]);
  if (!channels || !roles) return back({ error: "Discord didn't answer. Try again." });
  for (const id of [patch.birthdayChannelId, patch.countingChannelId])
    if (id && !channels.some((c) => c.id === id))
      return back({ error: "Pick channels from this server's list." });
  if (patch.birthdayRoleId) {
    const role = roles.find((r) => r.id === patch.birthdayRoleId);
    if (!role) return back({ error: "Pick the birthday role from this server's list." });
    if (role.managed || isDangerousRole(role.permissions))
      return back({
        error: `@${role.name} has moderation or admin powers, or belongs to a bot, so it can't be the birthday role.`,
      });
  }
  const result = await applySettingsChange(await getDb(), {
    guildId: guild.id,
    module: "fun",
    patch,
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back({
      error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute.",
    });
  return back({ ok: "Saved." });
}
