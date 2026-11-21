import { and, asc, desc, eq, gt, isNull, ne } from "drizzle-orm";
import type { Db } from "../client";
import {
  aiUsage,
  appeals,
  birthdays,
  giveawayEntries,
  guildPlans,
  guilds,
  lfgMembers,
  linkedAccounts,
  memberXp,
  opsSignups,
  planBundles,
  rankProfiles,
  rosterShares,
  suggestions,
  wallets,
  webSessions,
} from "../schema";

/**
 * A person's own data, as the Account page shows, exports and erases it. Every query here is
 * scoped to one user ID, which callers take from the signed-in session, never from a form.
 * Server records about the person (moderation cases, staff notes, tickets, the event log)
 * belong to each server and are not read or changed here.
 */

/** Sign-ins that still work: not signed out, not expired. Newest first, no token hashes. */
export async function listMySignIns(db: Db, userId: string, now = new Date()) {
  return db
    .select({
      tokenHash: webSessions.tokenHash,
      createdAt: webSessions.createdAt,
      lastSeenAt: webSessions.lastSeenAt,
      expiresAt: webSessions.expiresAt,
    })
    .from(webSessions)
    .where(
      and(
        eq(webSessions.userId, userId),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, now),
      ),
    )
    .orderBy(desc(webSessions.lastSeenAt));
}

/** Sign out every other browser: all of this user's live sessions except `keepHash`. */
export async function signOutElsewhere(db: Db, userId: string, keepHash: string) {
  const rows = await db
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(webSessions.userId, userId),
        ne(webSessions.tokenHash, keepHash),
        isNull(webSessions.revokedAt),
      ),
    )
    .returning({ tokenHash: webSessions.tokenHash });
  return rows.length;
}

/** Pro plans this person pays for, one per server, for the Account page's Billing tab. */
export async function listPlansIPay(db: Db, userId: string) {
  return db
    .select({
      guildId: guildPlans.guildId,
      guildName: guilds.name,
      status: guildPlans.stripeStatus,
      currentPeriodEnd: guildPlans.currentPeriodEnd,
      cancelAtPeriodEnd: guildPlans.cancelAtPeriodEnd,
    })
    .from(guildPlans)
    .innerJoin(guilds, eq(guilds.id, guildPlans.guildId))
    .where(
      and(
        eq(guildPlans.paidBy, userId),
        eq(guildPlans.plan, "pro"),
        eq(guildPlans.source, "stripe"),
        isNull(guildPlans.bundleId),
      ),
    )
    .orderBy(asc(guilds.name));
}

/**
 * Everything Garrison keeps that is the person's own, as plain JSON for "Download your data".
 * Removed links and stopped shares are included (they're still stored), with their dates.
 */
export async function exportMyData(db: Db, userId: string) {
  const [
    signIns,
    links,
    shares,
    rankCards,
    levels,
    walletRows,
    giveaways,
    groups,
    raids,
    suggestionRows,
    appealRows,
    proPlans,
    agencyPlans,
    ai,
    birthdayRows,
  ] = await Promise.all([
    db
      .select({
        username: webSessions.username,
        signedInAt: webSessions.createdAt,
        lastSeenAt: webSessions.lastSeenAt,
        expiresAt: webSessions.expiresAt,
        signedOutAt: webSessions.revokedAt,
      })
      .from(webSessions)
      .where(eq(webSessions.userId, userId))
      .orderBy(desc(webSessions.createdAt)),
    db
      .select({
        provider: linkedAccounts.provider,
        accountId: linkedAccounts.accountId,
        displayName: linkedAccounts.displayName,
        verified: linkedAccounts.verified,
        source: linkedAccounts.source,
        details: linkedAccounts.details,
        linkedAt: linkedAccounts.createdAt,
        refreshedAt: linkedAccounts.refreshedAt,
        removedAt: linkedAccounts.removedAt,
      })
      .from(linkedAccounts)
      .where(eq(linkedAccounts.userId, userId))
      .orderBy(asc(linkedAccounts.provider)),
    db
      .select({
        serverId: rosterShares.guildId,
        server: guilds.name,
        sharedAt: rosterShares.sharedAt,
        stoppedAt: rosterShares.removedAt,
      })
      .from(rosterShares)
      .innerJoin(guilds, eq(guilds.id, rosterShares.guildId))
      .where(eq(rosterShares.userId, userId)),
    db
      .select({
        serverId: rankProfiles.guildId,
        server: guilds.name,
        details: rankProfiles.details,
        updatedAt: rankProfiles.updatedAt,
      })
      .from(rankProfiles)
      .innerJoin(guilds, eq(guilds.id, rankProfiles.guildId))
      .where(eq(rankProfiles.userId, userId)),
    db
      .select({
        serverId: memberXp.guildId,
        server: guilds.name,
        xp: memberXp.xp,
        level: memberXp.level,
        messages: memberXp.messages,
        voiceMinutes: memberXp.voiceMinutes,
        lastXpAt: memberXp.lastXpAt,
      })
      .from(memberXp)
      .innerJoin(guilds, eq(guilds.id, memberXp.guildId))
      .where(eq(memberXp.userId, userId)),
    db
      .select({
        serverId: wallets.guildId,
        server: guilds.name,
        balance: wallets.balance,
        streak: wallets.streak,
        updatedAt: wallets.updatedAt,
      })
      .from(wallets)
      .innerJoin(guilds, eq(guilds.id, wallets.guildId))
      .where(eq(wallets.userId, userId)),
    db
      .select({
        giveawayId: giveawayEntries.giveawayId,
        entries: giveawayEntries.weight,
        enteredAt: giveawayEntries.enteredAt,
      })
      .from(giveawayEntries)
      .where(eq(giveawayEntries.userId, userId)),
    db
      .select({
        groupId: lfgMembers.postId,
        slot: lfgMembers.slotName,
        joinedAt: lfgMembers.joinedAt,
        leftAt: lfgMembers.leftAt,
        attended: lfgMembers.attended,
      })
      .from(lfgMembers)
      .where(eq(lfgMembers.userId, userId)),
    db
      .select({
        raidId: opsSignups.eventId,
        role: opsSignups.role,
        spec: opsSignups.spec,
        bench: opsSignups.bench,
        signedUpAt: opsSignups.signedUpAt,
        leftAt: opsSignups.leftAt,
        attended: opsSignups.attended,
      })
      .from(opsSignups)
      .where(eq(opsSignups.userId, userId)),
    db
      .select({
        serverId: suggestions.guildId,
        number: suggestions.number,
        text: suggestions.text,
        anonymous: suggestions.anonymous,
        status: suggestions.status,
        createdAt: suggestions.createdAt,
      })
      .from(suggestions)
      .where(eq(suggestions.authorId, userId)),
    db
      .select({
        serverId: appeals.guildId,
        caseNumber: appeals.caseNumber,
        appeal: appeals.body,
        response: appeals.response,
        createdAt: appeals.createdAt,
        decidedAt: appeals.decidedAt,
      })
      .from(appeals)
      .where(eq(appeals.userId, userId)),
    db
      .select({
        serverId: guildPlans.guildId,
        status: guildPlans.stripeStatus,
        currentPeriodEnd: guildPlans.currentPeriodEnd,
        cancelAtPeriodEnd: guildPlans.cancelAtPeriodEnd,
      })
      .from(guildPlans)
      .where(eq(guildPlans.paidBy, userId)),
    db
      .select({
        seats: planBundles.seats,
        source: planBundles.source,
        status: planBundles.stripeStatus,
        currentPeriodEnd: planBundles.currentPeriodEnd,
        createdAt: planBundles.createdAt,
      })
      .from(planBundles)
      .where(eq(planBundles.ownerId, userId)),
    db
      .select({
        serverId: aiUsage.guildId,
        feature: aiUsage.feature,
        model: aiUsage.model,
        supplies: aiUsage.supplies,
        at: aiUsage.createdAt,
      })
      .from(aiUsage)
      .where(eq(aiUsage.requestedBy, userId))
      .orderBy(desc(aiUsage.createdAt))
      .limit(5000),
    db
      .select({
        serverId: birthdays.guildId,
        server: guilds.name,
        month: birthdays.month,
        day: birthdays.day,
      })
      .from(birthdays)
      .innerJoin(guilds, eq(guilds.id, birthdays.guildId))
      .where(eq(birthdays.userId, userId)),
  ]);
  return {
    signIns,
    linkedAccounts: links,
    sharedWith: shares,
    rankCardDetails: rankCards,
    levels,
    wallets: walletRows,
    giveawayEntries: giveaways,
    groupsJoined: groups,
    raidSignups: raids,
    suggestions: suggestionRows,
    appeals: appealRows,
    proPlansYouPayFor: proPlans,
    agencyPlans,
    aiAssistantUse: ai,
    birthdays: birthdayRows,
  };
}

/**
 * "Erase what you control": every link removed and wiped (name and details), every server
 * stops seeing them, rank card details cleared everywhere, and every sign-in ended. Server
 * records (XP, cases, tickets) stay with each server. Returns what changed, for the message.
 */
export async function eraseMyData(db: Db, userId: string) {
  const now = new Date();
  const links = await db
    .update(linkedAccounts)
    .set({ removedAt: now, displayName: "", details: {} })
    .where(eq(linkedAccounts.userId, userId))
    .returning({ id: linkedAccounts.id, removedAt: linkedAccounts.removedAt });
  const shares = await db
    .update(rosterShares)
    .set({ removedAt: now })
    .where(and(eq(rosterShares.userId, userId), isNull(rosterShares.removedAt)))
    .returning({ guildId: rosterShares.guildId });
  const cards = await db
    .update(rankProfiles)
    .set({ details: {}, updatedAt: now })
    .where(eq(rankProfiles.userId, userId))
    .returning({ guildId: rankProfiles.guildId });
  // Birthdays are the member's own, saved with /birthday: gone from every server.
  const birthdaysGone = await db
    .delete(birthdays)
    .where(eq(birthdays.userId, userId))
    .returning({ guildId: birthdays.guildId });
  await db
    .update(webSessions)
    .set({ revokedAt: now })
    .where(and(eq(webSessions.userId, userId), isNull(webSessions.revokedAt)));
  return {
    links: links.length,
    shares: shares.length,
    cards: cards.length,
    birthdays: birthdaysGone.length,
  };
}
