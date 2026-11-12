import type { Guild, Invite } from "discord.js";
import { PermissionFlagsBits } from "discord.js";

/**
 * Which invite someone joined with: Discord doesn't say, so Garrison remembers each
 * invite's use count and, on a join, looks for the one that went up. Needs Manage
 * Server (to list invites). During a burst of joins it stops guessing: with
 * several joins at once the counts can't tell them apart.
 */

type Uses = Map<string, { uses: number; inviterId: string | null; inviterName: string | null }>;
const cache = new Map<string, Uses>();
const recentJoins = new Map<string, number[]>();
const BURST = 4;
const BURST_MS = 10_000;

const toUses = (invites: Iterable<Invite>): Uses =>
  new Map(
    [...invites].map((i) => [
      i.code,
      {
        uses: i.uses ?? 0,
        inviterId: i.inviterId ?? null,
        inviterName: i.inviter?.username ?? null,
      },
    ]),
  );

async function fetchUses(guild: Guild): Promise<Uses | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;
  const uses = toUses(invites.values());
  if (guild.vanityURLCode) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    if (vanity)
      uses.set(guild.vanityURLCode, { uses: vanity.uses, inviterId: null, inviterName: null });
  }
  return uses;
}

/** Remember the counts now (on start-up, and when invites are made or deleted). */
export async function primeInvites(guild: Guild) {
  const uses = await fetchUses(guild);
  if (uses) cache.set(guild.id, uses);
}

/** The invite whose count went up, from two snapshots. Null unless exactly one did. */
export function usedInvite(before: Uses, after: Uses) {
  const up = [...after.entries()].filter(([code, a]) => a.uses > (before.get(code)?.uses ?? 0));
  if (up.length !== 1) return null;
  const [code, a] = up[0] as [
    string,
    { uses: number; inviterId: string | null; inviterName: string | null },
  ];
  return { code, inviterId: a.inviterId, inviterName: a.inviterName };
}

/** On a join: which invite they used, or null when it can't be told. */
export async function inviteForJoin(guild: Guild, now = Date.now()) {
  const times = [...(recentJoins.get(guild.id) ?? []).filter((t) => now - t < BURST_MS), now];
  recentJoins.set(guild.id, times);
  const before = cache.get(guild.id);
  const after = await fetchUses(guild);
  if (after) cache.set(guild.id, after);
  if (!before || !after || times.length > BURST) return null;
  return usedInvite(before, after);
}
