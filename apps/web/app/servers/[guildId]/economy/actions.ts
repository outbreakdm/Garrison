"use server";

import {
  applySettingsChange,
  checkEconomy,
  entitlements,
  getEconomy,
  getGuildPlan,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { type AutoResult, ownedFields } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

const json = (form: FormData, key: string): unknown => {
  try {
    return JSON.parse(String(form.get(key) ?? "null"));
  } catch {
    return undefined;
  }
};

/**
 * The economy's settings. Two panels save themselves (currency and earning; the shop), each
 * sending only its own fields (`_fields`); the rest keep their stored values. Roles and
 * channels must be this server's, and a shop role can't carry admin or moderation powers.
 */
export async function saveEconomy(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/economy`, outcome);
  const own = ownedFields(form);
  const take = (k: string) => !own || own.has(k);
  const db = await getDb();
  const [before, plan, roles, channels] = await Promise.all([
    getEconomy(db, guild.id),
    getGuildPlan(db, guild.id),
    listGuildRoles(guild.id).catch(() => null),
    listTextChannels(guild.id).catch(() => null),
  ]);
  if (!roles || !channels) return back({ error: "Discord didn't answer. Try again." });
  const raw = {
    enabled: take("enabled") ? form.get("enabled") === "on" : before.enabled,
    currency: take("currency") ? json(form, "currency") : before.currency,
    earn: take("earn") ? json(form, "earn") : before.earn,
    shop: take("shop") ? json(form, "shop") : before.shop,
    staffChannelId: take("staffChannelId")
      ? String(form.get("staffChannelId") ?? "") || null
      : before.staffChannelId,
    noEarnChannelIds: take("noEarnChannelIds")
      ? form.getAll("noEarnChannelIds").map(String)
      : before.noEarnChannelIds,
  };
  if (raw.currency === undefined || raw.earn === undefined || raw.shop === undefined)
    return back({ error: "The form didn't arrive whole. Try again." });
  const checked = checkEconomy(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const value = checked.value;
  const byId = new Map(roles.map((r) => [r.id, r]));
  for (const item of value.shop) {
    for (const id of [item.roleId, item.needsRoleId]) {
      if (id && !byId.has(id))
        return back({ error: `${item.name}: pick roles from this server's list.` });
    }
    const role = item.roleId ? byId.get(item.roleId) : null;
    if (role && (role.managed || isDangerousRole(role.permissions)))
      return back({
        error: `${item.name}: that role has admin or moderation powers, so the shop can't sell it.`,
      });
  }
  const text = new Set(channels.map((c) => c.id));
  if (
    (value.staffChannelId && !text.has(value.staffChannelId)) ||
    !value.noEarnChannelIds.every((id) => text.has(id))
  )
    return back({ error: "Pick channels from this server's list." });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "economy",
    patch: { ...value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: own?.has("shop")
      ? "Saved the shop."
      : value.enabled
        ? "Saved. The economy is on."
        : "Saved. The economy is off: nobody earns or spends.",
    changeId: result.change.id,
  });
}
