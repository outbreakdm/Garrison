import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Db } from "../client";
import { guilds, type LinkedAccount, linkedAccounts, rosterShares } from "../schema";

export interface LinkInput {
  userId: string;
  provider: string;
  accountId: string;
  displayName: string;
  verified: boolean;
  source: LinkedAccount["source"];
  details?: Record<string, unknown>;
}

/** Add or refresh a link. Re-linking a removed account brings it back. */
export async function upsertLink(db: Db, input: LinkInput) {
  const now = new Date();
  const [row] = await db
    .insert(linkedAccounts)
    .values({ ...input, details: input.details ?? {}, refreshedAt: now })
    .onConflictDoUpdate({
      target: [linkedAccounts.userId, linkedAccounts.provider, linkedAccounts.accountId],
      set: {
        displayName: input.displayName,
        verified: input.verified,
        source: input.source,
        details: input.details ?? {},
        refreshedAt: now,
        removedAt: null,
      },
    })
    .returning();
  if (!row) throw new Error("Link upsert returned no row");
  return row;
}

/**
 * Replace everything a member linked from one source (e.g. Discord Connections)
 * with the current list: new ones are added, ones no longer present are removed.
 */
export async function syncLinksFromSource(
  db: Db,
  userId: string,
  source: LinkedAccount["source"],
  providers: string[],
  links: LinkInput[],
) {
  for (const link of links) await upsertLink(db, link);
  const keep = links.map((l) => `${l.provider}:${l.accountId}`);
  const current = await db
    .select()
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.source, source),
        isNull(linkedAccounts.removedAt),
      ),
    );
  const stale = current.filter(
    (c) => providers.includes(c.provider) && !keep.includes(`${c.provider}:${c.accountId}`),
  );
  if (stale.length) {
    await db
      .update(linkedAccounts)
      .set({ removedAt: new Date() })
      .where(
        inArray(
          linkedAccounts.id,
          stale.map((s) => s.id),
        ),
      );
  }
  return { added: links.length, removed: stale.length };
}

export async function listLinks(db: Db, userId: string) {
  return db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), isNull(linkedAccounts.removedAt)))
    .orderBy(asc(linkedAccounts.provider), asc(linkedAccounts.displayName));
}

/** Remove one link, only if it belongs to `userId`. */
export async function removeLink(db: Db, userId: string, linkId: string) {
  const [row] = await db
    .update(linkedAccounts)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(linkedAccounts.id, linkId),
        eq(linkedAccounts.userId, userId),
        isNull(linkedAccounts.removedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Remove all of a member's links for one provider. */
export async function removeProviderLinks(db: Db, userId: string, provider: string) {
  const rows = await db
    .update(linkedAccounts)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.provider, provider),
        isNull(linkedAccounts.removedAt),
      ),
    )
    .returning({ id: linkedAccounts.id });
  return rows.length;
}

export async function updateLinkDetails(db: Db, linkId: string, details: Record<string, unknown>) {
  await db
    .update(linkedAccounts)
    .set({ details, refreshedAt: new Date() })
    .where(eq(linkedAccounts.id, linkId));
}

export async function setRosterShare(
  db: Db,
  guildId: string,
  userId: string,
  username: string,
  shared: boolean,
) {
  if (shared) {
    await db
      .insert(rosterShares)
      .values({ guildId, userId, username })
      .onConflictDoUpdate({
        target: [rosterShares.guildId, rosterShares.userId],
        set: { username, sharedAt: new Date(), removedAt: null },
      });
  } else {
    await db
      .update(rosterShares)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(rosterShares.guildId, guildId),
          eq(rosterShares.userId, userId),
          isNull(rosterShares.removedAt),
        ),
      );
  }
}

/** Servers a member shares their links with, for their account page. */
export async function listSharesForUser(db: Db, userId: string) {
  return db
    .select({
      guildId: rosterShares.guildId,
      guildName: guilds.name,
      sharedAt: rosterShares.sharedAt,
    })
    .from(rosterShares)
    .innerJoin(guilds, eq(guilds.id, rosterShares.guildId))
    .where(and(eq(rosterShares.userId, userId), isNull(rosterShares.removedAt)))
    .orderBy(asc(guilds.name));
}

/** A server's roster: members who chose to share, with their current links, optionally for one provider. */
export async function getRoster(db: Db, guildId: string, provider?: string) {
  const shares = await db
    .select()
    .from(rosterShares)
    .where(and(eq(rosterShares.guildId, guildId), isNull(rosterShares.removedAt)));
  if (!shares.length) return [];
  const conditions = [
    inArray(
      linkedAccounts.userId,
      shares.map((s) => s.userId),
    ),
    isNull(linkedAccounts.removedAt),
  ];
  if (provider) conditions.push(eq(linkedAccounts.provider, provider));
  const links = await db
    .select()
    .from(linkedAccounts)
    .where(and(...conditions))
    .orderBy(asc(linkedAccounts.provider));
  return shares
    .map((s) => ({
      userId: s.userId,
      username: s.username,
      links: links.filter((l) => l.userId === s.userId),
    }))
    .filter((m) => m.links.length > 0)
    .sort((a, b) => a.username.localeCompare(b.username));
}

/** Links due a refresh, oldest first. */
export async function listLinksToRefresh(db: Db, provider: string, olderThan: Date, limit = 20) {
  return db
    .select()
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.provider, provider),
        isNull(linkedAccounts.removedAt),
        notInArray(linkedAccounts.source, ["discord"]),
      ),
    )
    .orderBy(asc(linkedAccounts.refreshedAt))
    .limit(limit)
    .then((rows) => rows.filter((r) => r.refreshedAt < olderThan));
}
