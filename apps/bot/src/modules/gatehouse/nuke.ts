import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

/** Permissions that let one account wreck a server. Giving any of them to @everyone is reverted. */
export const DANGEROUS_PERMISSIONS =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageWebhooks |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.MentionEveryone;

export type NukeKind = "delete" | "ban";

/** Dangerous permissions present in `after` that weren't in `before`. */
export const dangerousBitsAdded = (before: bigint, after: bigint) =>
  after & ~before & DANGEROUS_PERMISSIONS;

const DISPLAY_NAMES: Record<string, string> = { ManageGuild: "Manage Server" };

/** "Administrator, Manage Server", using the names Discord's UI shows. */
export function permissionNames(bits: bigint) {
  return new PermissionsBitField(bits)
    .toArray()
    .map((name) => DISPLAY_NAMES[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(", ");
}

export interface TrustContext {
  ownerId: string;
  botId: string;
  trustedIds: string[];
}

/** The owner, Garrison itself and the owner's trusted list are never acted on. */
export const isTrusted = (actorId: string, t: TrustContext) =>
  actorId === t.ownerId || actorId === t.botId || t.trustedIds.includes(actorId);

/** Only the owner and trusted users may restore a quarantine or change anti-nuke. Garrison doesn't count. */
export const canOverrideAntiNuke = (
  userId: string,
  t: Pick<TrustContext, "ownerId" | "trustedIds">,
) => userId === t.ownerId || t.trustedIds.includes(userId);

/** Roles Garrison can take away: not @everyone, not managed by an integration, below Garrison's top role. */
export function removableRoleIds(
  roles: { id: string; position: number; managed: boolean }[],
  everyoneId: string,
  botTop: number,
) {
  return roles
    .filter((r) => r.id !== everyoneId && !r.managed && r.position < botTop)
    .map((r) => r.id);
}

/** Counts destructive actions per guild, per actor and per kind, in a sliding window. */
export class ActionRateTracker {
  private events = new Map<string, number[]>();

  record(
    guildId: string,
    actorId: string,
    kind: NukeKind,
    windowMs: number,
    now = Date.now(),
  ): number {
    const key = `${guildId}:${actorId}:${kind}`;
    const kept = (this.events.get(key) ?? []).filter((t) => t > now - windowMs);
    kept.push(now);
    this.events.set(key, kept);
    return kept.length;
  }

  reset(guildId: string, actorId: string) {
    for (const kind of ["delete", "ban"] as const)
      this.events.delete(`${guildId}:${actorId}:${kind}`);
  }
}
