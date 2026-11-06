import type { LockdownSnapshotEntry } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";

/** What a lockdown takes away: posting, threads, reactions and polls. Viewing and voice stay. */
export const LOCK_BITS =
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.CreatePublicThreads |
  PermissionFlagsBits.CreatePrivateThreads |
  PermissionFlagsBits.AddReactions |
  PermissionFlagsBits.SendPolls;

export interface Overwrite {
  id: string;
  type: 0 | 1;
  allow: bigint;
  deny: bigint;
}

export interface OverwriteChange {
  channelId: string;
  targetId: string;
  type: 0 | 1;
  /** New value, or null to delete the overwrite. */
  after: { allow: bigint; deny: bigint } | null;
}

/**
 * Plan the overwrite changes that lock one channel: deny LOCK_BITS to
 * @everyone and allow them to staff roles. Returns the changes plus a
 * snapshot of each overwrite's previous value. Channels @everyone can't see
 * are left alone, and overwrites that already match are skipped.
 */
export function planChannelLock(
  channelId: string,
  overwrites: Overwrite[],
  everyoneId: string,
  staffRoleIds: string[],
): { changes: OverwriteChange[]; snapshot: LockdownSnapshotEntry[] } {
  const byId = new Map(overwrites.map((o) => [o.id, o]));
  const everyone = byId.get(everyoneId);
  if (everyone && (everyone.deny & PermissionFlagsBits.ViewChannel) !== 0n) {
    return { changes: [], snapshot: [] };
  }

  const changes: OverwriteChange[] = [];
  const snapshot: LockdownSnapshotEntry[] = [];
  const targets: [string, "deny" | "allow"][] = [
    [everyoneId, "deny"],
    ...staffRoleIds.filter((id) => id !== everyoneId).map((id): [string, "allow"] => [id, "allow"]),
  ];

  for (const [targetId, mode] of targets) {
    const before = byId.get(targetId);
    const allow = before?.allow ?? 0n;
    const deny = before?.deny ?? 0n;
    const after =
      mode === "deny"
        ? { allow: allow & ~LOCK_BITS, deny: deny | LOCK_BITS }
        : { allow: allow | LOCK_BITS, deny: deny & ~LOCK_BITS };
    if (before && after.allow === allow && after.deny === deny) continue;

    changes.push({ channelId, targetId, type: before?.type ?? 0, after });
    snapshot.push({
      channelId,
      targetId,
      type: before?.type ?? 0,
      before: before ? { allow: allow.toString(), deny: deny.toString() } : null,
    });
  }
  return { changes, snapshot };
}

/** Turn a snapshot back into the changes that restore it exactly. */
export function planRestore(snapshot: LockdownSnapshotEntry[]): OverwriteChange[] {
  return snapshot.map((s) => ({
    channelId: s.channelId,
    targetId: s.targetId,
    type: s.type,
    after: s.before ? { allow: BigInt(s.before.allow), deny: BigInt(s.before.deny) } : null,
  }));
}

/**
 * Counts joins per guild in a sliding window. In memory, per process: fine
 * for one shard per guild, which is how Discord routes events anyway.
 */
export class JoinRateTracker {
  private joins = new Map<string, number[]>();

  /** Record a join and return how many joins fall within the last `windowMs`. */
  record(guildId: string, windowMs: number, now = Date.now()): number {
    const cutoff = now - windowMs;
    const kept = (this.joins.get(guildId) ?? []).filter((t) => t > cutoff);
    kept.push(now);
    this.joins.set(guildId, kept);
    return kept.length;
  }

  reset(guildId: string) {
    this.joins.delete(guildId);
  }
}

export const accountAgeDays = (createdAt: number, now = Date.now()) =>
  Math.floor((now - createdAt) / 86_400_000);

/** "2-day-old", "less than a day old" — for flags and verification errors. */
export function describeAccountAge(days: number) {
  if (days < 1) return "less than a day old";
  return `${days}-day-old`;
}
