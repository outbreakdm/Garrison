"use server";

import {
  applySettingsChange,
  checkWelcome,
  entitlements,
  getGuildPlan,
  getWelcome,
  type WelcomeConfig,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { type AutoResult, isAuto } from "@/lib/autosave";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { answer, type Outcome } from "@/lib/outcome";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/**
 * Welcome edits. Each re-checks access for the server in the form, re-reads the
 * plan, checks channels and roles belong to this server (and that roles given on
 * join have no moderation or admin powers), then saves with history and undo. The
 * Welcome page's panels save themselves and get the outcome back (lib/outcome).
 */

const PARTS = {
  join: {
    enabled: "joinEnabled",
    channel: "joinChannelId",
    card: "joinCard",
    name: "welcome card",
  },
  leave: {
    enabled: "leaveEnabled",
    channel: "leaveChannelId",
    card: "leaveCard",
    name: "leave card",
  },
  dm: { enabled: "dmEnabled", channel: null, card: "dmCard", name: "welcome DM" },
} as const;

const back = (form: FormData, guildId: string, outcome: Outcome, open = "") =>
  answer(form, `/servers/${guildId}/herald`, outcome, open ? `#${open}` : "");

async function save(
  form: FormData,
  patch: Partial<Record<keyof WelcomeConfig, unknown>>,
  ok: string,
  open: string,
): Promise<AutoResult> {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const guildId = access.guild.id;
  const [before, plan] = await Promise.all([getWelcome(db, guildId), getGuildPlan(db, guildId)]);
  const checked = checkWelcome(patch, entitlements(plan), before);
  if (!checked.ok) return back(form, guildId, { error: checked.error }, open);
  const result = await applySettingsChange(db, {
    guildId,
    module: "welcome",
    patch: checked.value,
    userId: access.session.userId,
    username: access.session.username,
  });
  if (!result.ok)
    return back(
      form,
      guildId,
      result.reason === "unchanged" ? "unchanged" : { error: "Try again in a minute." },
      open,
    );
  return back(form, guildId, { ok, changeId: result.change.id }, open);
}

export async function saveWelcomeCard(form: FormData): Promise<AutoResult> {
  const guildId = String(form.get("guildId") ?? "");
  const part = PARTS[String(form.get("part")) as keyof typeof PARTS];
  if (!part) redirect(`/servers/${guildId}/herald`);
  let card: unknown;
  try {
    card = JSON.parse(String(form.get("card") ?? ""));
  } catch {
    return back(form, guildId, { error: "That form wasn't valid. Refresh and try again." });
  }
  const patch: Partial<Record<keyof WelcomeConfig, unknown>> = {
    [part.enabled]: form.get("enabled") === "on",
    [part.card]: card,
  };
  if (part.channel) {
    const channelId = String(form.get("channelId") ?? "") || null;
    if (channelId) {
      const channels = await listTextChannels(guildId).catch(() => []);
      if (!channels.some((c) => c.id === channelId))
        return back(
          form,
          guildId,
          { error: "Pick a text channel from this server." },
          String(form.get("part")),
        );
    }
    patch[part.channel] = channelId;
  }
  return save(form, patch, `Saved the ${part.name}.`, String(form.get("part")));
}

export async function saveJoinRoles(form: FormData): Promise<AutoResult> {
  const guildId = String(form.get("guildId") ?? "");
  const ids = [...new Set(form.getAll("joinRoleIds").map(String).filter(Boolean))];
  const roles = await listGuildRoles(guildId).catch(() => null);
  if (!roles) return back(form, guildId, { error: "Discord didn't answer. Try again." }, "roles");
  const safe = new Set(
    roles.filter((r) => !r.managed && !isDangerousRole(r.permissions)).map((r) => r.id),
  );
  if (!ids.every((id) => safe.has(id)))
    return back(
      form,
      guildId,
      {
        error:
          "Pick roles from this server's list. Roles with moderation or admin powers can't be given on join.",
      },
      "roles",
    );
  return save(
    form,
    { joinRoleIds: ids },
    ids.length ? "Saved the roles on join." : "Roles on join are off.",
    "roles",
  );
}

/** The welcome image (Pro): off, a preset background, or an image uploaded to Discord. */
export async function saveWelcomeImage(form: FormData): Promise<AutoResult> {
  const choice = String(form.get("background") ?? "");
  const image = choice === "image" ? String(form.get("imageUrl") ?? "").trim() : choice;
  // "Your image" picked before its link is pasted: nothing to save yet.
  if (choice === "image" && !image && isAuto(form)) return { status: "unchanged" };
  return save(
    form,
    { joinImage: image || null },
    image ? "Saved the welcome image." : "The welcome image is off.",
    "image",
  );
}
