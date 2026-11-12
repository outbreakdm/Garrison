import {
  entitlements,
  getGuildPlan,
  getStatRoles,
  listSharedStats,
  listStatRoleGuilds,
  readStatRoles,
  type StatRole,
  statRoleChanges,
} from "@garrison/db";
import type { Client, Guild } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { rewardProblem } from "../ranks/rules.js";

/**
 * Roles that follow game stats (Pro). Every 30 minutes, and right after someone
 * links an account here, members sharing with the server get or lose the rule
 * roles. Like level rewards, a role that gained moderation or admin powers, is
 * managed, or sits above Garrison is never given.
 */

const EVERY_MS = 30 * 60_000;
let lastSweep = 0;
const REASON = "Barracks: roles from game stats";

function safeRole(guild: Guild, roleId: string) {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role || !me) return null;
  const problem = rewardProblem(
    {
      id: role.id,
      name: role.name,
      managed: role.managed,
      position: role.position,
      permissions: role.permissions.bitfield,
    },
    guild.roles.everyone.id,
    me.roles.highest.position,
  );
  return problem ? null : role;
}

/** Bring members' rule roles in line with their shared stats. `onlyUserId` for one member. */
export async function syncStatRoles(
  ctx: BotContext,
  guild: Guild,
  rules: StatRole[],
  onlyUserId?: string,
) {
  if (!rules.length) return;
  if (!entitlements(await getGuildPlan(ctx.db, guild.id))["barracks.statRoles"]) return;
  const sharing = (await listSharedStats(ctx.db, guild.id)).filter(
    (s) => !onlyUserId || s.userId === onlyUserId,
  );
  const seen = new Set<string>();
  for (const { userId, links } of sharing) {
    seen.add(userId);
    const member =
      guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (!member) continue;
    const { add, remove } = statRoleChanges(rules, links, new Set(member.roles.cache.keys()));
    for (const id of add) {
      const role = safeRole(guild, id);
      if (role) await member.roles.add(role, REASON).catch(() => null);
    }
    for (const id of remove) {
      const role = safeRole(guild, id);
      if (role) await member.roles.remove(role, REASON).catch(() => null);
    }
  }
  if (onlyUserId) {
    // Someone who stopped sharing (or unlinked) keeps no rule roles.
    if (seen.has(onlyUserId)) return;
    const member = await guild.members.fetch(onlyUserId).catch(() => null);
    for (const r of rules) {
      const role = member?.roles.cache.has(r.roleId) ? safeRole(guild, r.roleId) : null;
      if (role && member) await member.roles.remove(role, REASON).catch(() => null);
    }
    return;
  }
  for (const r of rules) {
    const role = safeRole(guild, r.roleId);
    if (!role) continue;
    for (const holder of role.members.values())
      if (!seen.has(holder.id)) await holder.roles.remove(role, REASON).catch(() => null);
  }
}

/** After someone links, shares or stops sharing in a server: just them, right away. */
export async function syncStatRolesFor(ctx: BotContext, guild: Guild, userId: string) {
  const rules = readStatRoles(await getStatRoles(ctx.db, guild.id));
  await syncStatRoles(ctx, guild, rules, userId).catch((error: unknown) =>
    ctx.logger.warn("Stat roles failed", { guildId: guild.id, error }),
  );
}

/** The minute sweep calls this; it does the work every 30 minutes. */
export async function sweepStatRoles(ctx: BotContext, client: Client<true>, now = Date.now()) {
  if (now - lastSweep < EVERY_MS) return;
  lastSweep = now;
  for (const row of await listStatRoleGuilds(ctx.db)) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    await syncStatRoles(ctx, guild, readStatRoles(row.statRoles)).catch((error: unknown) =>
      ctx.logger.warn("Stat roles failed", { guildId: guild.id, error }),
    );
  }
}
