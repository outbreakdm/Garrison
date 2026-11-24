"use server";

import { applySettingsChange, checkStreamRequests, getStreamRequests } from "@garrison/db";
import { redirect } from "next/navigation";
import type { AutoResult } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { checkGuildAccess } from "@/lib/session";

/**
 * Members asking for their stream: on or off, the staff channel, where approved streams
 * announce and who they ping, and the request panel's words. Channels and the role must be
 * this server's; posting the panel and deciding are requests to the bot.
 */
export async function saveStreamRequests(form: FormData): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""), "editor", "beacon");
  if (!access) redirect("/servers");
  const { guild, session } = access;
  const back = (outcome: Outcome) => answer(form, `/servers/${guild.id}/beacon`, outcome);
  const field = (name: string) => String(form.get(name) ?? "") || null;
  const raw = {
    requestsEnabled: form.get("requestsEnabled") === "on",
    requestReviewChannelId: field("requestReviewChannelId"),
    requestAlertChannelId: field("requestAlertChannelId"),
    requestRoleId: field("requestRoleId"),
    requestPanelTitle: String(form.get("requestPanelTitle") ?? ""),
    requestPanelBody: String(form.get("requestPanelBody") ?? ""),
  };
  const [channels, roles] = await Promise.all([
    listTextChannels(guild.id).catch(() => null),
    listNotifiableRoles(guild.id).catch(() => null),
  ]);
  if (!channels || !roles) return back({ error: "Discord didn't answer. Try again." });
  for (const id of [raw.requestReviewChannelId, raw.requestAlertChannelId])
    if (id && !channels.some((c) => c.id === id))
      return back({ error: "Pick text channels from this server's list." });
  if (raw.requestRoleId && !roles.some((r) => r.id === raw.requestRoleId))
    return back({ error: "Pick the role to ping from this server's list." });
  const checked = checkStreamRequests(raw);
  if (!checked.ok) return back({ error: checked.error });
  const db = await getDb();
  const before = await getStreamRequests(db, guild.id);
  const result = await applySettingsChange(db, {
    guildId: guild.id,
    module: "alerts",
    patch: { ...checked.value },
    userId: session.userId,
    username: session.username,
  });
  if (!result.ok)
    return back(result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." });
  return back({
    ok: !checked.value.requestsEnabled
      ? "Saved. Members can't ask for their stream; waiting requests stay below."
      : before.requestPanelMessageId
        ? "Saved. Post the panel again below to update the one in Discord."
        : "Saved. Post the request panel below.",
    changeId: result.change.id,
  });
}
