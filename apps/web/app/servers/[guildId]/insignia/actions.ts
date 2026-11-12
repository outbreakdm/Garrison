"use server";

import { randomInt } from "node:crypto";
import {
  applySettingsChange,
  checkRoleMenus,
  entitlements,
  getGuildPlan,
  getRoleMenuPost,
  getRoleMenus,
  newId,
  ROLE_MENU_PRESETS,
  type RoleMenu,
  readRoleMenus,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listGuildRoles } from "@/lib/discord";
import { flashBack } from "@/lib/flash";
import { isDangerousRole } from "@/lib/permissions";
import { checkGuildAccess } from "@/lib/session";

/**
 * Role menu edits. Each action re-checks access for the server in the form,
 * re-reads the plan, and validates the whole list with the same checker the bot
 * uses. Every role must belong to this server, and a role a menu hands out can't
 * be managed by an integration or carry moderation or admin powers.
 */

const back = (guildId: string, outcome: { ok: string } | { error: string }, open = "") =>
  flashBack(`/servers/${guildId}/insignia`, outcome, `${open ? `?edit=${open}#${open}` : ""}`);

async function load(form: FormData) {
  const access = await checkGuildAccess(String(form.get("guildId") ?? ""));
  if (!access) redirect("/servers");
  const db = await getDb();
  const [raw, plan] = await Promise.all([
    getRoleMenus(db, access.guild.id),
    getGuildPlan(db, access.guild.id),
  ]);
  return { ...access, ent: entitlements(plan), menus: readRoleMenus(raw) };
}

type Ctx = Awaited<ReturnType<typeof load>>;

async function save(ctx: Ctx, next: unknown[], ok: string, open = "") {
  const checked = checkRoleMenus(next, ctx.ent, ctx.menus);
  if (!checked.ok) return back(ctx.guild.id, { error: checked.error }, open);
  const result = await applySettingsChange(await getDb(), {
    guildId: ctx.guild.id,
    module: "roles",
    patch: { menus: checked.value },
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

const crypto01 = () => randomInt(0, 1_000_000) / 1_000_000;

export async function addMenu(form: FormData) {
  const ctx = await load(form);
  const preset = ROLE_MENU_PRESETS[String(form.get("preset") ?? "")];
  if (!preset) return back(ctx.guild.id, { error: "Pick a starting point." });
  const name = String(form.get("name") ?? "").trim() || preset.name;
  const menu: RoleMenu = {
    id: newId(crypto01),
    name,
    card: preset.card,
    style: preset.style,
    options: [],
    maxPicks: preset.maxPicks,
    requiredRoleId: null,
    placeholder: null,
  };
  return save(ctx, [...ctx.menus, menu], `Added ${name}. Add its roles, then post it.`, menu.id);
}

/** Roles this server lets a menu hand out, and roles a menu may require. */
async function serverRoles(guildId: string) {
  const roles = await listGuildRoles(guildId).catch(() => null);
  if (!roles) return null;
  return {
    give: new Set(
      roles.filter((r) => !r.managed && !isDangerousRole(r.permissions)).map((r) => r.id),
    ),
    need: new Set(roles.filter((r) => !r.managed).map((r) => r.id)),
  };
}

export async function saveMenu(form: FormData) {
  const ctx = await load(form);
  let menu: RoleMenu;
  try {
    menu = JSON.parse(String(form.get("menu") ?? "")) as RoleMenu;
  } catch {
    return back(ctx.guild.id, { error: "That form wasn't valid. Refresh and try again." });
  }
  const id = typeof menu?.id === "string" ? menu.id : "";
  if (!ctx.menus.some((m) => m.id === id))
    return back(ctx.guild.id, { error: "That menu was removed. Refresh and try again." });
  const roles = await serverRoles(ctx.guild.id);
  if (!roles) return back(ctx.guild.id, { error: "Discord didn't answer. Try again." }, id);
  const options = Array.isArray(menu.options) ? menu.options : [];
  if (!options.every((o) => roles.give.has(String(o?.roleId))))
    return back(
      ctx.guild.id,
      {
        error:
          "Pick roles from this server's list. Roles with moderation or admin powers, and roles an integration manages, can't be in a menu.",
      },
      id,
    );
  if (menu.requiredRoleId && !roles.need.has(String(menu.requiredRoleId)))
    return back(ctx.guild.id, { error: "Pick the needed role from this server's list." }, id);
  const next = ctx.menus.map((m) => (m.id === id ? menu : m));
  const name = typeof menu.name === "string" ? menu.name.trim() : "the menu";
  const posted = await getRoleMenuPost(await getDb(), ctx.guild.id, id);
  return save(
    ctx,
    next,
    posted ? `Saved ${name}. Update it in Discord below.` : `Saved ${name}.`,
    id,
  );
}

export async function removeMenu(form: FormData) {
  const ctx = await load(form);
  const id = String(form.get("menuId") ?? "");
  const gone = ctx.menus.find((m) => m.id === id);
  if (!gone) return back(ctx.guild.id, { error: "That menu was already removed." });
  return save(
    ctx,
    ctx.menus.filter((m) => m.id !== id),
    `Removed ${gone.name}. Its buttons in Discord stop working; undo it from Settings history.`,
  );
}
