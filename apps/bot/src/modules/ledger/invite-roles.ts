import { getInviteLabels, type InviteLabel } from "@garrison/db";
import { type GuildMember, PermissionFlagsBits } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { DANGEROUS_PERMISSIONS } from "../gatehouse/nuke.js";

/**
 * Invite roles: someone who joins with a labelled invite gets that label's role. Never a role
 * with admin or moderation powers, never one above Garrison's own, and only when Garrison can
 * tell which invite they used (not during a burst of joins).
 */

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; labels: InviteLabel[] }>();

async function labels(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.labels;
  const fresh = await getInviteLabels(ctx.db, guildId);
  cache.set(guildId, { at: Date.now(), labels: fresh });
  return fresh;
}

export async function giveInviteRole(ctx: BotContext, member: GuildMember, code: string) {
  const label = (await labels(ctx, member.guild.id)).find((l) => l.code === code);
  if (!label?.roleId) return;
  const role = member.guild.roles.cache.get(label.roleId);
  if (!role || role.managed || role.permissions.any(DANGEROUS_PERMISSIONS)) return;
  const me = member.guild.members.me ?? (await member.guild.members.fetchMe());
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    ctx.logger.warn("Can't give an invite's role: Garrison's role sits below it", {
      guildId: member.guild.id,
    });
    return;
  }
  await member.roles.add(role, `Joined with the invite “${label.name}”`);
}
