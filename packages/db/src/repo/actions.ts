import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import {
  type AntiNukePayload,
  type BuildVersionPayload,
  type CallSignupsPayload,
  type CaseNumberPayload,
  type CreateLfgPayload,
  type CreateRaidPayload,
  type DashboardAction,
  dashboardActions,
  type IdPayload,
  type LfgJoinPayload,
  type LockdownStartPayload,
  type ModActionPayload,
  type MoveSignupPayload,
  type PostRoleMenuPayload,
  type PurgePayload,
  type QmPlanPayload,
  type RaidSignupPayload,
  type RaidWithdrawPayload,
  type VerifyPanelPayload,
} from "../schema";

export type QueueInput =
  | { kind: "create_raid"; payload: CreateRaidPayload }
  | { kind: "move_signup"; payload: MoveSignupPayload }
  | { kind: "call_signups"; payload: CallSignupsPayload }
  | { kind: "lockdown_start"; payload: LockdownStartPayload }
  | { kind: "lockdown_end"; payload: Record<string, never> }
  | { kind: "release_quarantine"; payload: IdPayload }
  | { kind: "undo_case"; payload: CaseNumberPayload }
  | { kind: "cancel_raid"; payload: IdPayload }
  | { kind: "close_lfg"; payload: IdPayload }
  | { kind: "undo_build"; payload: BuildVersionPayload }
  | { kind: "run_health"; payload: Record<string, never> }
  | { kind: "post_verify_panel"; payload: VerifyPanelPayload }
  | { kind: "anti_nuke"; payload: AntiNukePayload }
  | { kind: "mod_action"; payload: ModActionPayload }
  | { kind: "purge"; payload: PurgePayload }
  | { kind: "create_lfg"; payload: CreateLfgPayload }
  | { kind: "lfg_join"; payload: LfgJoinPayload }
  | { kind: "lfg_leave"; payload: IdPayload }
  | { kind: "raid_signup"; payload: RaidSignupPayload }
  | { kind: "raid_withdraw"; payload: RaidWithdrawPayload }
  | { kind: "qm_plan"; payload: QmPlanPayload }
  | { kind: "qm_apply"; payload: IdPayload }
  | { kind: "qm_cancel"; payload: IdPayload }
  | { kind: "post_role_menu"; payload: PostRoleMenuPayload };

/** Per server: at most this many requests waiting at once. */
export const MAX_PENDING_PER_GUILD = 10;
/** Per member: at most this many requests a minute. */
export const MAX_PER_USER_PER_MINUTE = 5;
/** One call for signups per raid per hour, so the dashboard can't be used to spam a channel. */
export const CALL_SIGNUPS_COOLDOWN_MS = 60 * 60_000;
/** A request nobody picked up in this long is dropped rather than done late. */
export const ACTION_TTL_MS = 10 * 60_000;

export type QueueResult =
  | { ok: true; action: DashboardAction }
  | { ok: false; reason: "busy" | "too_fast" | "cooldown" };

/** Add a request, within the rate limits. Serialised per server so limits can't be raced. */
export async function queueDashboardAction(
  db: Db,
  guildId: string,
  user: { id: string; name: string },
  input: QueueInput,
  now = new Date(),
): Promise<QueueResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:actions:${guildId}`}))`);
    const [pending] = await tx
      .select({ n: count() })
      .from(dashboardActions)
      .where(
        and(
          eq(dashboardActions.guildId, guildId),
          inArray(dashboardActions.status, ["pending", "running"]),
        ),
      );
    if ((pending?.n ?? 0) >= MAX_PENDING_PER_GUILD) return { ok: false, reason: "busy" };
    const [recent] = await tx
      .select({ n: count() })
      .from(dashboardActions)
      .where(
        and(
          eq(dashboardActions.guildId, guildId),
          eq(dashboardActions.requestedById, user.id),
          gte(dashboardActions.createdAt, new Date(now.getTime() - 60_000)),
        ),
      );
    if ((recent?.n ?? 0) >= MAX_PER_USER_PER_MINUTE) return { ok: false, reason: "too_fast" };
    if (input.kind === "call_signups") {
      const [call] = await tx
        .select({ n: count() })
        .from(dashboardActions)
        .where(
          and(
            eq(dashboardActions.guildId, guildId),
            eq(dashboardActions.kind, "call_signups"),
            sql`${dashboardActions.payload}->>'eventId' = ${input.payload.eventId}`,
            inArray(dashboardActions.status, ["pending", "running", "done"]),
            gte(dashboardActions.createdAt, new Date(now.getTime() - CALL_SIGNUPS_COOLDOWN_MS)),
          ),
        );
      if ((call?.n ?? 0) > 0) return { ok: false, reason: "cooldown" };
    }
    const [action] = await tx
      .insert(dashboardActions)
      .values({
        guildId,
        kind: input.kind,
        payload: input.payload,
        requestedById: user.id,
        requestedByName: user.name,
      })
      .returning();
    if (!action) throw new Error("Action insert returned no row");
    return { ok: true, action };
  });
}

export async function listDashboardActions(db: Db, guildId: string, limit = 10) {
  return db
    .select()
    .from(dashboardActions)
    .where(eq(dashboardActions.guildId, guildId))
    .orderBy(desc(dashboardActions.createdAt))
    .limit(limit);
}

/**
 * Bot side. Expire requests that waited too long (or were left running by a
 * crash), then claim up to `limit` pending ones. A claimed request is never
 * claimed again, so each one runs at most once.
 */
export async function claimDashboardActions(db: Db, limit = 10, now = new Date()) {
  const stale = new Date(now.getTime() - ACTION_TTL_MS);
  await db
    .update(dashboardActions)
    .set({
      status: "failed",
      message: "Garrison didn't get to this in time. Try again.",
      processedAt: now,
    })
    .where(
      and(
        inArray(dashboardActions.status, ["pending", "running"]),
        lt(dashboardActions.createdAt, stale),
      ),
    );
  return db
    .update(dashboardActions)
    .set({ status: "running" })
    .where(
      inArray(
        dashboardActions.id,
        sql`(SELECT id FROM ${dashboardActions} WHERE ${dashboardActions.status} = 'pending'
             ORDER BY ${dashboardActions.createdAt} LIMIT ${limit} FOR UPDATE SKIP LOCKED)`,
      ),
    )
    .returning();
}

export async function finishDashboardAction(
  db: Db,
  id: string,
  outcome: { ok: boolean; message: string },
  now = new Date(),
) {
  await db
    .update(dashboardActions)
    .set({ status: outcome.ok ? "done" : "failed", message: outcome.message, processedAt: now })
    .where(and(eq(dashboardActions.id, id), eq(dashboardActions.status, "running")));
}
