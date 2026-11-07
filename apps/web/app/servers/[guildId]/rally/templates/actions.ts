"use server";

import { randomInt } from "node:crypto";
import {
  applySettingsChange,
  checkTemplates,
  getGuildPlan,
  getRallyTemplates,
  newTemplateId,
  type RallyTemplate,
  TEMPLATE_PRESETS,
} from "@garrison/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listNotifiableRoles, listTextChannels } from "@/lib/discord";
import { templateFromForm, upsertTemplate } from "@/lib/rally-templates";
import { checkGuildAccess } from "@/lib/session";

/**
 * Rally template edits. Each action re-checks access for the server in the
 * form, re-reads the plan, and validates the whole list with the same checker
 * the bot uses. Channels and roles must belong to this server.
 */

const FLASH = "garrison_flash";

async function back(guildId: string, outcome: { ok: string } | { error: string }, anchor = "") {
  // Messages travel in a short-lived httpOnly cookie, not the URL, so a link
  // can't put arbitrary text on the page.
  (await cookies()).set(FLASH, JSON.stringify(outcome), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/servers/${guildId}/rally/templates`,
    maxAge: 20,
  });
  redirect(`/servers/${guildId}/rally/templates${anchor ? `#${anchor}` : ""}`);
}

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getRallyTemplates(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  // The stored list is checked with the widest rules so a downgrade doesn't lock editing.
  const current = checkTemplates(raw, "pro");
  return { ...access, plan, templates: current.ok ? current.value : [] };
}

async function save(
  ctx: Awaited<ReturnType<typeof load>>,
  next: unknown[],
  ok: string,
  anchor = "",
) {
  const checked = checkTemplates(next, ctx.plan);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, anchor);
  const result = await applySettingsChange(await getDb(), {
    guildId: ctx.guild.id,
    module: "rally",
    patch: { templates: checked.value },
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(
      ctx.guild.id,
      { error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute." },
      anchor,
    );
  return back(ctx.guild.id, { ok }, anchor);
}

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

export async function addTemplate(form: FormData) {
  const ctx = await load(form);
  const preset = TEMPLATE_PRESETS[String(form.get("preset") ?? "")];
  if (!preset) return back(ctx.guild.id, { error: "Pick a starting point." });
  const name = String(form.get("name") ?? "").trim() || preset.name;
  const t: RallyTemplate = {
    ...preset,
    name,
    id: newTemplateId(crypto01),
    channelIds: [],
    notifyRoleId: null,
    isDefault: ctx.templates.length === 0,
  };
  return save(ctx, [...ctx.templates, t], `Added ${name}. Change its wording below.`, t.id);
}

export async function saveTemplate(form: FormData) {
  const ctx = await load(form);
  const t = templateFromForm(form);
  if (!ctx.templates.some((x) => x.id === t.id))
    return back(ctx.guild.id, { error: "That template was removed. Refresh and try again." });
  const channelIds = t.channelIds as string[];
  const roleId = t.notifyRoleId as string | null;
  const [channels, roles] = await Promise.all([
    channelIds.length ? listTextChannels(ctx.guild.id).catch(() => null) : [],
    roleId ? listNotifiableRoles(ctx.guild.id).catch(() => null) : [],
  ]);
  if (!channels || !channelIds.every((c) => channels.some((x) => x.id === c)))
    return back(ctx.guild.id, { error: "Pick channels from this server." }, String(t.id));
  if (!roles || (roleId && !roles.some((r) => r.id === roleId)))
    return back(ctx.guild.id, { error: "Pick a role from this server." }, String(t.id));
  return save(
    ctx,
    upsertTemplate(ctx.templates, t),
    `Saved ${String(t.name).trim()}.`,
    String(t.id),
  );
}

export async function removeTemplate(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("templateId") ?? "");
  const gone = ctx.templates.find((t) => t.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That template was already removed." });
  return save(
    ctx,
    ctx.templates.filter((t) => t.id !== id),
    `Removed ${gone.name}. Undo it from Settings history.`,
  );
}
