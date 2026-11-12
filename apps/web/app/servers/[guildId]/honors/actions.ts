"use server";

import {
  applySettingsChange,
  checkStarboard,
  entitlements,
  getGuildPlan,
  getStarboard,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { checkGuildAccess } from "@/lib/session";

/**
 * Starboard settings. Re-checks access for the server in the form and the plan,
 * and checks every channel belongs to this server.
 */
export async function saveStarboard(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: { ok: string } | { error: string }) =>
    flashBack(`/servers/${guild.id}/honors`, outcome);
  const db = await getDb();
  const [before, plan, channels] = await Promise.all([
    getStarboard(db, guild.id),
    getGuildPlan(db, guild.id),
    listTextChannels(guild.id).catch(() => null),
  ]);
  if (!channels) return back({ error: "Discord didn't answer. Try again." });
  const raw = {
    enabled: form.get("enabled") === "on",
    channelId: String(form.get("channelId") ?? ""),
    emoji: String(form.get("emoji") ?? ""),
    threshold: Number(form.get("threshold")),
    selfStar: form.get("selfStar") === "on",
    ignoredChannelIds: form.getAll("ignoredChannelIds").map(String),
    accent: String(form.get("accent") ?? "") || null,
  };
  const known = new Set(channels.map((c) => c.id));
  if (
    (raw.channelId && !known.has(raw.channelId)) ||
    !raw.ignoredChannelIds.every((id) => known.has(id))
  )
    return back({ error: "Pick channels from this server's list." });
  const checked = checkStarboard(raw, entitlements(plan), before);
  if (!checked.ok) return back({ error: checked.error });
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "starboard",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back({
      error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute.",
    });
  return back({
    ok: checked.value.enabled
      ? `Saved. Messages with ${checked.value.threshold} ${checked.value.emoji} go to the starboard.`
      : "Saved. The starboard is off.",
  });
}
