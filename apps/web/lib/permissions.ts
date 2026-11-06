/** Discord permission maths, mirrored from Discord's rules. Pure, so it's testable. */

export const ADMINISTRATOR = 1n << 3n;
export const MANAGE_GUILD = 1n << 5n;

export interface GuildSnapshot {
  ownerId: string;
  everyoneRoleId: string;
  roles: { id: string; permissions: string }[];
}

/** A member's server-wide permissions: @everyone plus each of their roles; the owner has everything. */
export function memberPermissions(
  guild: GuildSnapshot,
  userId: string,
  memberRoleIds: string[],
): bigint {
  if (userId === guild.ownerId) return ~0n;
  const byId = new Map(guild.roles.map((r) => [r.id, BigInt(r.permissions)]));
  let perms = byId.get(guild.everyoneRoleId) ?? 0n;
  for (const id of memberRoleIds) perms |= byId.get(id) ?? 0n;
  return perms;
}

/** Dashboard access rule: Manage Server or Administrator. */
export const canManage = (perms: bigint) => (perms & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
