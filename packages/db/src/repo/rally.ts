import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../client";
import type { GuildPlan, RallyWording } from "../rally";
import { NOTIFY_COOLDOWN_MS } from "../rally";
import {
  guildPlans,
  type LfgMember,
  type LfgPost,
  type LfgSlotGroup,
  lfgMembers,
  lfgPosts,
  rallySettings,
} from "../schema";

export const capacity = (slots: LfgSlotGroup[]) => slots.reduce((n, g) => n + g.count, 0);

export type PickResult =
  | { ok: true; slot: string }
  | { ok: false; reason: "full" | "slot_full" | "no_such_slot" };

/**
 * Choose the slot a member joins: the requested one if it has room, otherwise
 * the first group with room. `members` are the active members, excluding the
 * one joining.
 */
export function pickSlot(
  slots: LfgSlotGroup[],
  members: Pick<LfgMember, "slotName">[],
  requested?: string,
): PickResult {
  const taken = (name: string) => members.filter((m) => m.slotName === name).length;
  if (requested !== undefined) {
    const group = slots.find((g) => g.name === requested);
    if (!group) return { ok: false, reason: "no_such_slot" };
    return taken(group.name) < group.count
      ? { ok: true, slot: group.name }
      : { ok: false, reason: "slot_full" };
  }
  const open = slots.find((g) => taken(g.name) < g.count);
  return open ? { ok: true, slot: open.name } : { ok: false, reason: "full" };
}

export interface CreateLfgInput {
  guildId: string;
  channelId: string;
  hostId: string;
  hostSlot: string;
  title: string;
  note: string | null;
  slots: LfgSlotGroup[];
  startsAt: Date;
  expiresAt: Date;
  templateId?: string | null;
  wording?: (RallyWording & { voice: boolean }) | null;
}

/** Create a post with the host in it. Returns null if the host already has an open group here. */
export async function createLfgPost(db: Db, input: CreateLfgInput): Promise<LfgPost | null> {
  return db.transaction(async (tx) => {
    const { hostSlot, ...post } = input;
    const [row] = await tx.insert(lfgPosts).values(post).onConflictDoNothing().returning();
    if (!row) return null;
    await tx
      .insert(lfgMembers)
      .values({ postId: row.id, userId: input.hostId, slotName: hostSlot });
    return row;
  });
}

export async function setLfgMessage(db: Db, id: string, messageId: string) {
  await db.update(lfgPosts).set({ messageId }).where(eq(lfgPosts.id, id));
}

export async function getLfgPost(db: Db, guildId: string, id: string) {
  const [row] = await db
    .select()
    .from(lfgPosts)
    .where(and(eq(lfgPosts.guildId, guildId), eq(lfgPosts.id, id)));
  return row ?? null;
}

export async function listActiveMembers(db: Db, postId: string) {
  return db
    .select()
    .from(lfgMembers)
    .where(and(eq(lfgMembers.postId, postId), isNull(lfgMembers.leftAt)))
    .orderBy(asc(lfgMembers.joinedAt));
}

export type JoinResult =
  | { ok: true; post: LfgPost; members: LfgMember[]; becameFull: boolean; switched: boolean }
  | {
      ok: false;
      reason: "not_found" | "closed" | "already" | "full" | "slot_full" | "no_such_slot";
    };

/**
 * Join (or switch slot in) a post. The post row is locked for the whole
 * transaction, so two people can't both take the last slot.
 */
export async function joinLfg(
  db: Db,
  postId: string,
  userId: string,
  requested?: string,
): Promise<JoinResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(lfgPosts).where(eq(lfgPosts.id, postId)).for("update");
    if (!post) return { ok: false, reason: "not_found" };
    if (post.status === "closed" || post.status === "expired")
      return { ok: false, reason: "closed" };

    const active = await tx
      .select()
      .from(lfgMembers)
      .where(and(eq(lfgMembers.postId, postId), isNull(lfgMembers.leftAt)));
    const mine = active.find((m) => m.userId === userId);
    if (mine && (requested === undefined || mine.slotName === requested))
      return { ok: false, reason: "already" };

    const pick = pickSlot(
      post.slots,
      active.filter((m) => m.userId !== userId),
      requested,
    );
    if (!pick.ok) return pick;

    await tx
      .insert(lfgMembers)
      .values({ postId, userId, slotName: pick.slot })
      .onConflictDoUpdate({
        target: [lfgMembers.postId, lfgMembers.userId],
        set: { slotName: pick.slot, leftAt: null, joinedAt: mine ? mine.joinedAt : new Date() },
      });

    const count = active.length + (mine ? 0 : 1);
    const becameFull = post.status === "open" && count >= capacity(post.slots);
    let updated = post;
    if (becameFull) {
      const [row] = await tx
        .update(lfgPosts)
        .set({ status: "full" })
        .where(eq(lfgPosts.id, postId))
        .returning();
      if (row) updated = row;
    }
    const members = await tx
      .select()
      .from(lfgMembers)
      .where(and(eq(lfgMembers.postId, postId), isNull(lfgMembers.leftAt)))
      .orderBy(asc(lfgMembers.joinedAt));
    return { ok: true, post: updated, members, becameFull, switched: !!mine };
  });
}

export type LeaveResult =
  | { ok: true; post: LfgPost; members: LfgMember[]; hostLeft: boolean }
  | { ok: false; reason: "not_found" | "not_member" | "closed" };

/** Leave a post. A full post opens up again; if the host leaves, the post closes. */
export async function leaveLfg(db: Db, postId: string, userId: string): Promise<LeaveResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx.select().from(lfgPosts).where(eq(lfgPosts.id, postId)).for("update");
    if (!post) return { ok: false, reason: "not_found" };
    if (post.status === "closed" || post.status === "expired")
      return { ok: false, reason: "closed" };

    const [left] = await tx
      .update(lfgMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(lfgMembers.postId, postId),
          eq(lfgMembers.userId, userId),
          isNull(lfgMembers.leftAt),
        ),
      )
      .returning();
    if (!left) return { ok: false, reason: "not_member" };

    const hostLeft = userId === post.hostId;
    const status = hostLeft ? "closed" : "open";
    const [updated] = await tx
      .update(lfgPosts)
      .set({ status, closedAt: hostLeft ? new Date() : null })
      .where(eq(lfgPosts.id, postId))
      .returning();
    const members = await tx
      .select()
      .from(lfgMembers)
      .where(and(eq(lfgMembers.postId, postId), isNull(lfgMembers.leftAt)))
      .orderBy(asc(lfgMembers.joinedAt));
    return { ok: true, post: updated ?? post, members, hostLeft };
  });
}

/** Close or expire a post. Returns null if it was already closed. */
export async function closeLfg(db: Db, postId: string, status: "closed" | "expired" = "closed") {
  const [row] = await db
    .update(lfgPosts)
    .set({ status, closedAt: new Date() })
    .where(and(eq(lfgPosts.id, postId), inArray(lfgPosts.status, ["open", "full"])))
    .returning();
  return row ?? null;
}

export async function listOpenLfg(db: Db, guildId: string) {
  return db
    .select()
    .from(lfgPosts)
    .where(and(eq(lfgPosts.guildId, guildId), inArray(lfgPosts.status, ["open", "full"])))
    .orderBy(asc(lfgPosts.startsAt));
}

export async function findOpenLfgByHost(db: Db, guildId: string, hostId: string) {
  const [row] = await db
    .select()
    .from(lfgPosts)
    .where(
      and(
        eq(lfgPosts.guildId, guildId),
        eq(lfgPosts.hostId, hostId),
        inArray(lfgPosts.status, ["open", "full"]),
      ),
    );
  return row ?? null;
}

export async function listExpiredLfg(db: Db, now = new Date()) {
  return db
    .select()
    .from(lfgPosts)
    .where(and(inArray(lfgPosts.status, ["open", "full"]), lte(lfgPosts.expiresAt, now)));
}

/** Posts that still own a voice channel, for cleanup. */
export async function listLfgWithVoice(db: Db) {
  return db.select().from(lfgPosts).where(isNotNull(lfgPosts.voiceChannelId));
}

export async function setLfgVoice(db: Db, id: string, voiceChannelId: string | null) {
  await db.update(lfgPosts).set({ voiceChannelId }).where(eq(lfgPosts.id, id));
}

// --- Templates and plans -------------------------------------------------------

/** The stored template list, unchecked. Callers run it through checkTemplates before use. */
export async function getRallyTemplates(db: Db, guildId: string): Promise<unknown[]> {
  const [row] = await db
    .select({ templates: rallySettings.templates })
    .from(rallySettings)
    .where(eq(rallySettings.guildId, guildId));
  return Array.isArray(row?.templates) ? row.templates : [];
}

export async function getGuildPlan(db: Db, guildId: string): Promise<GuildPlan> {
  const [row] = await db
    .select({ plan: guildPlans.plan })
    .from(guildPlans)
    .where(eq(guildPlans.guildId, guildId));
  return row?.plan ?? "free";
}

/**
 * Claim the right to notify a template's role for this post: at most once per
 * template every NOTIFY_COOLDOWN_MS. Returns false when it's too soon.
 */
export async function claimRallyNotify(
  db: Db,
  guildId: string,
  templateId: string,
  postId: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:notify:${guildId}:${templateId}`}))`,
    );
    const [recent] = await tx
      .select({ id: lfgPosts.id })
      .from(lfgPosts)
      .where(
        and(
          eq(lfgPosts.guildId, guildId),
          eq(lfgPosts.templateId, templateId),
          gt(lfgPosts.notifiedAt, new Date(now.getTime() - NOTIFY_COOLDOWN_MS)),
        ),
      )
      .limit(1);
    if (recent) return false;
    await tx.update(lfgPosts).set({ notifiedAt: now }).where(eq(lfgPosts.id, postId));
    return true;
  });
}
