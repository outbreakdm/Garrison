import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Db } from "../client";
import { linkedAccounts, twitchSubRoles, twitchSubscribers } from "../schema";

/** Twitch subscriber roles (best bot item 10). See schema.ts twitchSubRoles. */

export async function getTwitchSubRole(db: Db, guildId: string) {
  const [row] = await db.select().from(twitchSubRoles).where(eq(twitchSubRoles.guildId, guildId));
  return row ?? null;
}

/** A streamer connected (or connected again): active, keeping the role already picked. */
export async function connectTwitchSubs(
  db: Db,
  input: { guildId: string; broadcasterId: string; broadcasterLogin: string; connectedBy: string },
) {
  await db
    .insert(twitchSubRoles)
    .values({ ...input, status: "active" })
    .onConflictDoUpdate({
      target: twitchSubRoles.guildId,
      set: {
        broadcasterId: input.broadcasterId,
        broadcasterLogin: input.broadcasterLogin,
        connectedBy: input.connectedBy,
        status: "active",
        updatedAt: new Date(),
      },
    });
}

export async function setTwitchSubRoleId(db: Db, guildId: string, roleId: string | null) {
  await db
    .update(twitchSubRoles)
    .set({ roleId, updatedAt: new Date() })
    .where(eq(twitchSubRoles.guildId, guildId));
}

/** Disconnect: the server stops following the streamer. Its subscriber list goes when nobody else does. */
export async function disconnectTwitchSubs(db: Db, guildId: string) {
  const [gone] = await db
    .delete(twitchSubRoles)
    .where(eq(twitchSubRoles.guildId, guildId))
    .returning({ broadcasterId: twitchSubRoles.broadcasterId });
  if (!gone) return null;
  const [still] = await db
    .select({ guildId: twitchSubRoles.guildId })
    .from(twitchSubRoles)
    .where(eq(twitchSubRoles.broadcasterId, gone.broadcasterId));
  if (!still)
    await db
      .delete(twitchSubscribers)
      .where(eq(twitchSubscribers.broadcasterId, gone.broadcasterId));
  return gone.broadcasterId;
}

/** Twitch said the streamer took Garrison's access away: every server following them stops. */
export async function revokeTwitchSubs(db: Db, broadcasterId: string) {
  await db
    .update(twitchSubRoles)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(twitchSubRoles.broadcasterId, broadcasterId));
}

/** The full list, read at connecting: replaces what was there. */
export async function replaceTwitchSubscribers(
  db: Db,
  broadcasterId: string,
  subs: { userId: string; tier: string }[],
) {
  await db.transaction(async (tx) => {
    const ids = subs.map((s) => s.userId);
    await tx
      .delete(twitchSubscribers)
      .where(
        ids.length
          ? and(
              eq(twitchSubscribers.broadcasterId, broadcasterId),
              notInArray(twitchSubscribers.userId, ids),
            )
          : eq(twitchSubscribers.broadcasterId, broadcasterId),
      );
    for (let i = 0; i < subs.length; i += 500) {
      const batch = subs.slice(i, i + 500);
      await tx
        .insert(twitchSubscribers)
        .values(batch.map((s) => ({ broadcasterId, userId: s.userId, tier: s.tier })))
        .onConflictDoNothing();
    }
  });
}

/** One subscription started (or a gift landed). */
export async function addTwitchSubscriber(
  db: Db,
  broadcasterId: string,
  userId: string,
  tier: string,
) {
  await db
    .insert(twitchSubscribers)
    .values({ broadcasterId, userId, tier })
    .onConflictDoUpdate({
      target: [twitchSubscribers.broadcasterId, twitchSubscribers.userId],
      set: { tier, updatedAt: new Date() },
    });
}

export async function removeTwitchSubscriber(db: Db, broadcasterId: string, userId: string) {
  await db
    .delete(twitchSubscribers)
    .where(
      and(eq(twitchSubscribers.broadcasterId, broadcasterId), eq(twitchSubscribers.userId, userId)),
    );
}

/** Whether any server follows this streamer: a webhook for one nobody follows is ignored. */
export async function followsTwitch(db: Db, broadcasterId: string) {
  const [row] = await db
    .select({ guildId: twitchSubRoles.guildId })
    .from(twitchSubRoles)
    .where(eq(twitchSubRoles.broadcasterId, broadcasterId));
  return Boolean(row);
}

/** Servers whose subscriber role is set and working, for the bot's sweep. */
export async function listTwitchSubRoleGuilds(db: Db) {
  return (await db.select().from(twitchSubRoles).where(eq(twitchSubRoles.status, "active"))).filter(
    (r) => r.roleId,
  );
}

/** The Discord users who subscribe: their linked Twitch account (from Discord Connections) is on the list. */
export async function twitchSubscriberDiscordIds(db: Db, broadcasterId: string) {
  const subs = await db
    .select({ userId: twitchSubscribers.userId })
    .from(twitchSubscribers)
    .where(eq(twitchSubscribers.broadcasterId, broadcasterId));
  if (!subs.length) return new Set<string>();
  const ids = subs.map((s) => s.userId);
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db
      .select({ userId: linkedAccounts.userId })
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.provider, "twitch"),
          eq(linkedAccounts.verified, true),
          isNull(linkedAccounts.removedAt),
          inArray(linkedAccounts.accountId, ids.slice(i, i + 1000)),
        ),
      );
    for (const r of rows) out.add(r.userId);
  }
  return out;
}
