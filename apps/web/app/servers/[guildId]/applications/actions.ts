"use server";

import { randomInt } from "node:crypto";
import {
  type ApplicationForm,
  applySettingsChange,
  checkApplicationForms,
  entitlements,
  getApplicationForms,
  getGuildPlan,
  newId,
  readApplicationForms,
  VERIFY_LIMITS,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGuildRoles, listTextChannels } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/**
 * Application forms (packages/db applications.ts). Each edit re-checks access and the plan,
 * keeps the staff channel to this server's text channels and the roles to ones an accepted
 * applicant may safely get, checks the whole list, and saves through Settings history.
 */

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

async function load(form: FormData) {
  const access = await checkGuildAccess(
    String(form.get("guildId") ?? ""),
    "editor",
    "applications",
  );
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getApplicationForms(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, db, ent: entitlements(plan), forms: readApplicationForms(raw) };
}

const back = (guildId: string, outcome: { ok: string } | { error: string }, open = "") =>
  flashBack(`/servers/${guildId}/applications`, outcome, open ? `#form-${open}` : "#forms");

async function save(ctx: Awaited<ReturnType<typeof load>>, next: unknown[], ok: string, open = "") {
  const checked = checkApplicationForms(next, ctx.ent, ctx.forms);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, open);
  const result = await applySettingsChange(ctx.db, {
    guildId: ctx.guild.id,
    module: "applications",
    patch: { forms: checked.value },
    userId: ctx.session.userId,
    username: ctx.session.username,
  });
  if (!result.ok)
    return back(
      ctx.guild.id,
      { error: result.reason === "unchanged" ? "Nothing changed." : "Try again in a minute." },
      open,
    );
  return back(ctx.guild.id, { ok }, open);
}

/** Add a form, or save one (`id`). Questions come as rows; a row without a question is skipped. */
export async function saveForm(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  const was = ctx.forms.find((f) => f.id === id);
  const labels = form.getAll("qlabel").map(String);
  const helps = form.getAll("qhelp").map(String);
  const ids = form.getAll("qid").map(String);
  const kinds = form.getAll("qlong").map(String);
  const questions = labels
    .map((label, i) => ({
      id: ids[i] || undefined,
      label: label.trim(),
      help: (helps[i] ?? "").trim() || null,
      long: kinds[i] === "long",
    }))
    .filter((q) => q.label)
    .slice(0, VERIFY_LIMITS.parts);
  const reviewChannelId = String(form.get("reviewChannelId") ?? "");
  const acceptRoleIds = form.getAll("acceptRoleIds").map(String).filter(Boolean);
  const [channels, roles] = await Promise.all([
    listTextChannels(ctx.guild.id).catch(() => null),
    acceptRoleIds.length ? listGuildRoles(ctx.guild.id).catch(() => null) : [],
  ]);
  if (!channels || !roles)
    return back(ctx.guild.id, { error: "Discord didn't answer. Try again." }, id);
  if (reviewChannelId && !channels.some((c) => c.id === reviewChannelId))
    return back(ctx.guild.id, { error: "Pick the staff channel from this server's list." }, id);
  for (const rid of acceptRoleIds) {
    const role = roles.find((r) => r.id === rid);
    if (!role) return back(ctx.guild.id, { error: "Pick roles from this server's list." }, id);
    if (role.managed || isDangerousRole(role.permissions))
      return back(
        ctx.guild.id,
        {
          error: `@${role.name} has moderation or admin powers, or belongs to a bot, so an application can't give it.`,
        },
        id,
      );
  }
  const next: ApplicationForm = {
    id: was?.id ?? newId(crypto01),
    name: String(form.get("name") ?? ""),
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? "") || null,
    intro: String(form.get("intro") ?? "") || null,
    questions: questions as ApplicationForm["questions"],
    reviewChannelId,
    acceptRoleIds,
    buttonLabel: String(form.get("buttonLabel") ?? "") || "Apply",
  };
  return save(
    ctx,
    was ? ctx.forms.map((f) => (f.id === was.id ? next : f)) : [...ctx.forms, next],
    was
      ? `Saved ${next.name.trim() || "the form"}.`
      : `Added ${next.name.trim() || "a form"}. Post it to a channel next.`,
    next.id,
  );
}

export async function removeForm(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("id") ?? "");
  const gone = ctx.forms.find((f) => f.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That form was already removed." });
  return save(
    ctx,
    ctx.forms.filter((f) => f.id !== id),
    `Removed ${gone.name}. Its posted panel stops taking applications; undo it from Settings history.`,
  );
}
