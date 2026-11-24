import { and, count, desc, eq, getTableColumns, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../client";
import type { Availability } from "../raids";
import {
  type AntiNukePayload,
  type BotProfilePayload,
  type BuildVersionPayload,
  type CallSignupsPayload,
  type CaseNumberPayload,
  type CreateLfgPayload,
  type CreateRaidPayload,
  type DashboardAction,
  dashboardActions,
  type GiveawayActionPayload,
  type IdPayload,
  type LfgJoinPayload,
  type LockdownStartPayload,
  type ModActionPayload,
  type MoveSignupPayload,
  type PostMessagePayload,
  type PostRoleMenuPayload,
  type PostTicketPanelPayload,
  type PurgePayload,
  type QmChatPayload,
  type QmEditPayload,
  type QmPlanPayload,
  type QmRemovePayload,
  type RaidSignupPayload,
  type RaidWithdrawPayload,
  type StartGiveawayPayload,
  type TestAlertPayload,
  type TicketActionPayload,
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
  | { kind: "post_lineup"; payload: { eventId: string } }
  | {
      kind: "raid_answer";
      payload: {
        eventId: string;
        availability: Availability;
        characterId: string | null;
        role: string | null;
      };
    }
  | { kind: "qm_plan"; payload: QmPlanPayload }
  | { kind: "qm_chat"; payload: QmChatPayload }
  | { kind: "qm_apply"; payload: IdPayload }
  | { kind: "qm_cancel"; payload: IdPayload }
  | { kind: "qm_remove"; payload: QmRemovePayload }
  | { kind: "qm_edit"; payload: QmEditPayload }
  | { kind: "post_role_menu"; payload: PostRoleMenuPayload }
  | { kind: "bot_profile"; payload: BotProfilePayload }
  | { kind: "post_message"; payload: PostMessagePayload }
  | { kind: "post_ticket_panel"; payload: PostTicketPanelPayload }
  | { kind: "ticket_action"; payload: TicketActionPayload }
  | { kind: "start_giveaway"; payload: StartGiveawayPayload }
  | { kind: "giveaway_action"; payload: GiveawayActionPayload }
  | { kind: "test_alert"; payload: TestAlertPayload }
  | { kind: "web_verify"; payload: { answers?: Record<string, string> } }
  | { kind: "verify_decide"; payload: { id: string; approve: boolean } }
  | { kind: "economy_adjust"; payload: { userId: string; amount: number; reason: string } }
  | { kind: "economy_buy"; payload: { itemId: string; answer?: string } }
  | { kind: "economy_purchase"; payload: { id: string; done: boolean } }
  | { kind: "post_application_panel"; payload: { formId: string; channelId: string } }
  | { kind: "post_suggestion_panel"; payload: { channelId: string } }
  | { kind: "post_lfg_panel"; payload: { channelId: string } }
  | { kind: "post_shop_panel"; payload: { channelId: string } }
  | { kind: "post_stream_panel"; payload: { channelId: string } }
  | { kind: "stream_request_decide"; payload: { id: string; approve: boolean } }
  | { kind: "application_decide"; payload: { id: string; accept: boolean } }
  | { kind: "backup_create"; payload: Record<string, never> }
  | { kind: "backup_restore"; payload: { backupId: string } }
  | { kind: "season_start"; payload: { name: string } }
  | { kind: "template_save"; payload: { name: string } }
  | { kind: "template_apply"; payload: { templateId: string } }
  | {
      kind: "suggestion_status";
      payload: {
        id: string;
        status: "open" | "planned" | "done" | "declined";
        note: string | null;
      };
    }
  // Several at once from a list (2026-11-23): one request, up to BULK_MAX items, each checked
  // and done by the bot as if it were asked alone.
  | { kind: "undo_cases"; payload: { caseNumbers: number[] } }
  | {
      kind: "ticket_bulk";
      payload: { op: "claim" | "close"; ticketIds: string[]; reason: string | null };
    };

/** The most items one bulk request (undo_cases, ticket_bulk) carries. */
export const BULK_MAX = 10;

/** Per server: at most this many requests waiting at once. */
export const MAX_PENDING_PER_GUILD = 10;
/** Per member: at most this many requests a minute. */
export const MAX_PER_USER_PER_MINUTE = 5;
/**
 * Hand changes in the AI assistant's Your server panel (renames, drags) come quickly, cost
 * nothing and only change a draft, so they have their own, larger allowance, and don't use up
 * the one above.
 */
export const HAND_EDITS_PENDING = 20;
export const HAND_EDITS_PER_MINUTE = 30;
/** One call for signups per raid per hour, so the dashboard can't be used to spam a channel. */
export const CALL_SIGNUPS_COOLDOWN_MS = 60 * 60_000;
/** A request nobody picked up in this long is dropped rather than done late. */
export const ACTION_TTL_MS = 10 * 60_000;

export type QueueResult =
  | { ok: true; action: DashboardAction }
  | { ok: false; reason: "busy" | "too_fast" | "cooldown" };

/** Add a request, within the rate limits. Serialized per server so limits can't be raced. */
export async function queueDashboardAction(
  db: Db,
  guildId: string,
  user: { id: string; name: string },
  input: QueueInput,
  now = new Date(),
): Promise<QueueResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`garrison:actions:${guildId}`}))`);
    // Hand edits count among themselves; every other request among the others.
    const hand = input.kind === "qm_edit";
    const sameClass = hand
      ? eq(dashboardActions.kind, "qm_edit")
      : sql`${dashboardActions.kind} <> 'qm_edit'`;
    const [pending] = await tx
      .select({ n: count() })
      .from(dashboardActions)
      .where(
        and(
          eq(dashboardActions.guildId, guildId),
          inArray(dashboardActions.status, ["pending", "running"]),
          sameClass,
        ),
      );
    if ((pending?.n ?? 0) >= (hand ? HAND_EDITS_PENDING : MAX_PENDING_PER_GUILD))
      return { ok: false, reason: "busy" };
    const [recent] = await tx
      .select({ n: count() })
      .from(dashboardActions)
      .where(
        and(
          eq(dashboardActions.guildId, guildId),
          eq(dashboardActions.requestedById, user.id),
          gte(dashboardActions.createdAt, new Date(now.getTime() - 60_000)),
          sameClass,
        ),
      );
    if ((recent?.n ?? 0) >= (hand ? HAND_EDITS_PER_MINUTE : MAX_PER_USER_PER_MINUTE))
      return { ok: false, reason: "too_fast" };
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

/** Recent requests. Image data is left out of the payload: pages only show outcomes. */
export async function listDashboardActions(db: Db, guildId: string, limit = 10) {
  return db
    .select({
      ...getTableColumns(dashboardActions),
      payload: sql<unknown>`${dashboardActions.payload} - 'avatar' - 'banner'`,
    })
    .from(dashboardActions)
    .where(eq(dashboardActions.guildId, guildId))
    .orderBy(desc(dashboardActions.createdAt))
    .limit(limit);
}

/**
 * Bot side. Expire requests that waited too long (or were left running by a
 * crash), then claim up to `limit` pending ones. A claimed request is never
 * claimed again, so each one runs at most once. `expire: false` skips the first
 * step: the bot claims every few seconds but only needs to expire once a minute.
 */
export async function claimDashboardActions(
  db: Db,
  limit = 10,
  now = new Date(),
  { expire = true }: { expire?: boolean } = {},
) {
  if (expire) await expireDashboardActions(db, now);
  // Never one past its time, even between expiry sweeps: the next sweep fails it instead.
  const stale = new Date(now.getTime() - ACTION_TTL_MS);
  return db
    .update(dashboardActions)
    .set({ status: "running" })
    .where(
      inArray(
        dashboardActions.id,
        sql`(SELECT id FROM ${dashboardActions} WHERE ${dashboardActions.status} = 'pending'
             AND ${dashboardActions.createdAt} >= ${stale.toISOString()}::timestamptz
             ORDER BY ${dashboardActions.createdAt} LIMIT ${limit} FOR UPDATE SKIP LOCKED)`,
      ),
    )
    .returning();
}

/** Fail requests that waited past ACTION_TTL_MS, or were left running by a crash. */
export async function expireDashboardActions(db: Db, now = new Date()) {
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
}

/**
 * What a running request is doing now ("Looking at your settings"), for the page to show
 * while it waits. Only while it runs; the finish message replaces it.
 */
export async function noteDashboardAction(db: Db, id: string, message: string) {
  await db
    .update(dashboardActions)
    .set({ message: message.slice(0, 200) })
    .where(and(eq(dashboardActions.id, id), eq(dashboardActions.status, "running")));
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
