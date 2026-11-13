import {
  type Entitlements,
  entitlements,
  getGuildPlan,
  getRoleMenus,
  isPaused,
  menuLimit,
  type RoleMenu,
  readRoleMenus,
  resolvePick,
} from "@garrison/db";
import { type GuildMember, PermissionFlagsBits, type Role } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import type { Card } from "../../lib/card.js";
import type { RoleFacts } from "../ranks/rules.js";
import { type MenuRoleProblem, menuRoleProblem, menuRoleProblemText } from "./menu.js";

export interface LoadedMenu {
  menu: RoleMenu;
  ent: Entitlements;
  paused: boolean;
}

/** A server's menu as saved now, with its plan. Null when the menu was removed. */
export async function loadMenu(
  ctx: BotContext,
  guildId: string,
  menuId: string,
): Promise<LoadedMenu | null> {
  const [raw, plan] = await Promise.all([
    getRoleMenus(ctx.db, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  const ent = entitlements(plan);
  const menus = readRoleMenus(raw);
  const index = menus.findIndex((m) => m.id === menuId);
  const menu = menus[index];
  return menu ? { menu, ent, paused: isPaused(index, ent) } : null;
}

export const roleFacts = (role: Role): RoleFacts => ({
  id: role.id,
  name: role.name,
  managed: role.managed,
  position: role.position,
  permissions: role.permissions.bitfield,
});

/** The first role in `ids` Garrison may not hand out, and why. */
export function firstRoleProblem(
  member: GuildMember,
  ids: string[],
): { id: string; problem: MenuRoleProblem } | null {
  const guild = member.guild;
  const top = guild.members.me?.roles.highest.position ?? 0;
  for (const id of ids) {
    const role = guild.roles.cache.get(id);
    const problem = menuRoleProblem(role ? roleFacts(role) : undefined, guild.id, top);
    if (problem) return { id, problem };
  }
  return null;
}

const note = (title: string, text: string, tone: Card["tone"] = "caution"): Card => ({
  tone,
  title,
  blocks: [{ text }],
  module: "insignia",
});

const mentions = (ids: string[]) => ids.map((id) => `<@&${id}>`).join(" ");

/**
 * A member pressed a button (`toggle`) or changed the dropdown (`set`). Every
 * rule is checked against the menu as saved now: the role must still be in the
 * menu, safe to hand out, and within the menu's limits. Limits a Pro server set
 * (picks, a needed role) keep applying after a downgrade: access never loosens.
 */
export async function pickRoles(
  ctx: BotContext,
  member: GuildMember,
  menuId: string,
  pick: { toggle: string } | { set: string[] },
): Promise<Card> {
  const loaded = await loadMenu(ctx, member.guild.id, menuId);
  if (!loaded)
    return note(
      "This menu was removed",
      "It isn't on the dashboard anymore. Ask a moderator for the new one.",
    );
  const { menu, ent, paused } = loaded;
  if (paused)
    return note(
      "This menu is paused",
      `This server has more role menus than its plan runs (${menuLimit(ent)}), so this one is resting. Nothing was lost: a moderator can remove a menu or upgrade on the dashboard.`,
    );
  if (menu.requiredRoleId && !member.roles.cache.has(menu.requiredRoleId))
    return note("Not for you yet", `This menu is for members with <@&${menu.requiredRoleId}>.`);

  const me = member.guild.members.me ?? (await member.guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
    return note(
      "Garrison can't give roles",
      "It needs the Manage Roles permission. Ask a moderator to check Garrison's role.",
      "alert",
    );

  const result = resolvePick(menu, [...member.roles.cache.keys()], pick);
  if (!result.ok)
    return result.reason === "too_many"
      ? note(
          "That's the most this menu allows",
          `Pick up to ${menu.maxPicks}. Drop one first, then pick again.`,
        )
      : note(
          "That role isn't in this menu anymore",
          "The menu changed since it was posted. Ask a moderator to post it again.",
        );

  const problem = firstRoleProblem(member, [...result.add, ...result.remove]);
  if (problem)
    return note(
      "Garrison can't do that",
      menuRoleProblemText(problem.problem, `<@&${problem.id}>`),
      "alert",
    );

  if (!result.add.length && !result.remove.length)
    return note("Nothing changed", "You already have exactly those roles.", "volt");
  const reason = `Role menu: ${menu.name}`;
  if (result.remove.length) await member.roles.remove(result.remove, reason);
  if (result.add.length) await member.roles.add(result.add, reason);

  const lines = [
    result.add.length ? `**Added** ${mentions(result.add)}` : null,
    result.remove.length ? `**Removed** ${mentions(result.remove)}` : null,
  ].filter((l): l is string => l !== null);
  return {
    tone: "go",
    title: "Roles updated",
    blocks: [{ text: lines.join("\n") }],
    module: "insignia",
  };
}
