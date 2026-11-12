"use server";

import {
  checkGiveaway,
  checkProfileRequest,
  countRunningGiveaways,
  entitlements,
  getAlertFeeds,
  getCase,
  getGiveaway,
  getGuildPlan,
  getLfgPost,
  getMessages,
  getOpsEvent,
  getQmBuild,
  getQmBuildByVersion,
  getQuarantine,
  getRoleMenus,
  getTicket,
  getTicketConfig,
  isPanelPaused,
  isPaused,
  type QueueInput,
  queueDashboardAction,
  readAlertFeeds,
  readMessages,
  readRoleMenus,
  TICKET_LIMITS,
} from "@garrison/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { guildOwnerId, listTextChannels } from "@/lib/discord";
import { checkGuildAccess } from "@/lib/session";

/**
 * Dashboard buttons that ask Garrison to do something in Discord. Each request
 * re-checks access for the server in the form, checks that what it points at
 * (a case, raid, group, build or quarantine) belongs to that server, and only
 * then queues it. The bot checks everything again before acting, including
 * the requester's own Discord permissions.
 */

const PAGES = new Set([
  "",
  "gatehouse",
  "watch",
  "rally",
  "quartermaster",
  "insignia",
  "settings",
  "dispatch",
  "parley",
  "spoils",
  "beacon",
]);
/** A member's page under Watch is the one page with an ID in its path. */
const MEMBER_PAGE = /^watch\/member\/\d{17,20}$/;
/** A ticket's own page. */
const TICKET_PAGE = /^parley\/\d{1,9}$/;
const SNOWFLAKE = /^\d{17,20}$/;
/** Timeout lengths the dashboard offers, in seconds: 1 min to 28 days. */
const TIMEOUTS = new Set([60, 600, 3600, 21_600, 86_400, 604_800, 2_419_200]);
/** How far back a ban may delete messages, as /ban offers. */
const BAN_DELETE = new Set([0, 3600, 86_400, 604_800]);
const LFG_STARTS = new Set(["now", "10m", "30m", "1h", "2h", "4h", "8h", "1d"]);
const isModAction = (v: string): v is "warn" | "timeout" | "kick" | "ban" =>
  v === "warn" || v === "timeout" || v === "kick" || v === "ban";
/** The @everyone role shares the server's ID; it is never a member. */
const userId0 = (guildId: string) => guildId;
const LOCK_MINUTES = new Set([0, 15, 30, 60, 120, 360, 1440]);
const uuid = z.string().uuid();

type Built = { ok: true; input: QueueInput } | { ok: false; error: string };

const field = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

async function build(form: FormData, guildId: string, requesterId: string): Promise<Built> {
  const db = await getDb();
  const kind = field(form, "kind");
  switch (kind) {
    case "lockdown_start": {
      const minutes = Number(field(form, "durationMinutes") || "0");
      if (!LOCK_MINUTES.has(minutes)) return { ok: false, error: "invalid" };
      const reason = field(form, "reason").slice(0, 200) || null;
      return {
        ok: true,
        input: {
          kind,
          payload: {
            durationMinutes: minutes || null,
            pauseInvites: form.get("pauseInvites") === "on",
            reason,
          },
        },
      };
    }
    case "lockdown_end":
    case "run_health":
      return { ok: true, input: { kind, payload: {} } };
    case "release_quarantine": {
      const id = uuid.safeParse(field(form, "id"));
      const q = id.success ? await getQuarantine(db, guildId, id.data) : null;
      if (!q || q.restoredAt) return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { id: q.id } } };
    }
    case "undo_case": {
      const n = Number(field(form, "caseNumber"));
      const c = Number.isInteger(n) && n > 0 ? await getCase(db, guildId, n) : null;
      if (!c || c.revokedAt) return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { caseNumber: n } } };
    }
    case "cancel_raid": {
      const id = uuid.safeParse(field(form, "id"));
      const e = id.success ? await getOpsEvent(db, guildId, id.data) : null;
      if (e?.status !== "scheduled") return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { id: e.id } } };
    }
    case "close_lfg": {
      const id = uuid.safeParse(field(form, "id"));
      const p = id.success ? await getLfgPost(db, guildId, id.data) : null;
      if (!p || (p.status !== "open" && p.status !== "full"))
        return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { id: p.id } } };
    }
    case "undo_build": {
      const v = Number(field(form, "version"));
      const b = Number.isInteger(v) && v > 0 ? await getQmBuildByVersion(db, guildId, v) : null;
      if (!b || (b.status !== "applied" && b.status !== "failed"))
        return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { version: v } } };
    }
    case "post_verify_panel": {
      const channelId = field(form, "channelId");
      const channels = await listTextChannels(guildId).catch(() => []);
      if (!channels.some((c) => c.id === channelId)) return { ok: false, error: "channel" };
      return { ok: true, input: { kind, payload: { channelId } } };
    }
    case "post_role_menu": {
      const menuId = field(form, "menuId");
      const channelId = field(form, "channelId");
      const [raw, plan, channels] = await Promise.all([
        getRoleMenus(db, guildId),
        getGuildPlan(db, guildId),
        listTextChannels(guildId).catch(() => []),
      ]);
      const menus = readRoleMenus(raw);
      const index = menus.findIndex((m) => m.id === menuId);
      const menu = menus[index];
      if (!menu) return { ok: false, error: "not_found" };
      if (isPaused(index, entitlements(plan))) return { ok: false, error: "menu_paused" };
      if (!menu.options.length) return { ok: false, error: "menu_empty" };
      if (!channels.some((c) => c.id === channelId)) return { ok: false, error: "channel" };
      return { ok: true, input: { kind, payload: { menuId: menu.id, channelId } } };
    }
    case "post_ticket_panel": {
      const panelId = field(form, "panelId");
      const channelId = field(form, "channelId");
      const [config, plan, channels] = await Promise.all([
        getTicketConfig(db, guildId),
        getGuildPlan(db, guildId),
        listTextChannels(guildId).catch(() => []),
      ]);
      const index = config.panels.findIndex((p) => p.id === panelId);
      const panel = config.panels[index];
      if (!panel) return { ok: false, error: "not_found" };
      if (isPanelPaused(index, entitlements(plan))) return { ok: false, error: "panel_paused" };
      if (!panel.topics.length) return { ok: false, error: "panel_empty" };
      if (!channels.some((c) => c.id === channelId)) return { ok: false, error: "channel" };
      return { ok: true, input: { kind, payload: { panelId: panel.id, channelId } } };
    }
    case "start_giveaway": {
      const ent = entitlements(await getGuildPlan(db, guildId));
      const checked = checkGiveaway(
        {
          channelId: field(form, "channelId"),
          prize: field(form, "prize"),
          description: String(form.get("description") ?? ""),
          winners: field(form, "winners"),
          durationMinutes: field(form, "durationMinutes"),
          requiredRoleId: field(form, "requiredRoleId") || null,
          minLevel: field(form, "minLevel") || null,
          bonusRoles: [0, 1, 2].map((i) => ({
            roleId: field(form, `bonusRole${i}`),
            extra: field(form, `bonusExtra${i}`),
          })),
          accent: field(form, "accent") || null,
          repeat: field(form, "repeat") === "on",
        },
        ent,
      );
      if (!checked.ok)
        return { ok: false, error: /Pro/.test(checked.error) ? "giveaway_pro" : "giveaway" };
      const channels = await listTextChannels(guildId).catch(() => []);
      if (!channels.some((c) => c.id === checked.value.channelId))
        return { ok: false, error: "channel" };
      if ((await countRunningGiveaways(db, guildId)) >= ent["giveaways.running"])
        return { ok: false, error: "giveaway_full" };
      return { ok: true, input: { kind, payload: checked.value } };
    }
    case "test_alert": {
      const feedId = field(form, "feedId");
      const feed = readAlertFeeds(await getAlertFeeds(db, guildId)).find((f) => f.id === feedId);
      if (!feed) return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { feedId: feed.id } } };
    }
    case "giveaway_action": {
      const op = field(form, "op");
      if (op !== "end" && op !== "reroll" && op !== "cancel")
        return { ok: false, error: "invalid" };
      const id = field(form, "giveawayId");
      const g = uuid.safeParse(id).success ? await getGiveaway(db, guildId, id) : null;
      if (!g) return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { giveawayId: g.id, op } } };
    }
    case "ticket_action": {
      const op = field(form, "op");
      if (op !== "claim" && op !== "close" && op !== "reopen")
        return { ok: false, error: "invalid" };
      const ticketId = field(form, "ticketId");
      const t = uuid.safeParse(ticketId).success ? await getTicket(db, guildId, ticketId) : null;
      if (!t) return { ok: false, error: "not_found" };
      if (op === "reopen" ? t.status !== "closed" : t.status !== "open")
        return { ok: false, error: op === "reopen" ? "ticket_open" : "ticket_closed" };
      const reason = field(form, "reason").trim().slice(0, TICKET_LIMITS.reason) || null;
      return { ok: true, input: { kind, payload: { ticketId: t.id, op, reason } } };
    }
    case "post_message": {
      const messageId = field(form, "messageId");
      const channelId = field(form, "channelId");
      const m = readMessages(await getMessages(db, guildId)).find((x) => x.id === messageId);
      if (!m) return { ok: false, error: "not_found" };
      const channels = await listTextChannels(guildId).catch(() => []);
      if (!channels.some((c) => c.id === channelId)) return { ok: false, error: "channel" };
      return { ok: true, input: { kind, payload: { messageId: m.id, channelId } } };
    }
    case "bot_profile": {
      let raw: unknown;
      try {
        raw = JSON.parse(field(form, "profile"));
      } catch {
        return { ok: false, error: "invalid" };
      }
      const checked = checkProfileRequest(raw, entitlements(await getGuildPlan(db, guildId)));
      if (!checked.ok)
        return { ok: false, error: /Pro/.test(checked.error) ? "profile_pro" : "profile" };
      return { ok: true, input: { kind, payload: checked.value } };
    }
    case "anti_nuke": {
      // Owner only, asked of Discord now; the bot asks again before applying.
      const owner = await guildOwnerId(guildId).catch(() => null);
      if (!owner || owner !== requesterId) return { ok: false, error: "owner_only" };
      const trustedIds = [
        ...new Set(
          field(form, "trustedIds")
            .split(/[\s,]+/)
            .filter(Boolean),
        ),
      ];
      const del = Number(field(form, "deleteThreshold"));
      const ban = Number(field(form, "banThreshold"));
      if (
        trustedIds.length > 10 ||
        !trustedIds.every((id) => /^\d{17,20}$/.test(id)) ||
        !Number.isInteger(del) ||
        del < 2 ||
        del > 50 ||
        !Number.isInteger(ban) ||
        ban < 2 ||
        ban > 100
      )
        return { ok: false, error: "invalid" };
      return {
        ok: true,
        input: {
          kind,
          payload: {
            enabled: form.get("enabled") === "on",
            trustedIds,
            deleteThreshold: del,
            banThreshold: ban,
          },
        },
      };
    }
    case "mod_action": {
      const action = field(form, "action");
      const userId = field(form, "userId");
      const duration = Number(field(form, "duration") || "0");
      const del = Number(field(form, "deleteMessages") || "0");
      if (
        !isModAction(action) ||
        !SNOWFLAKE.test(userId) ||
        userId === userId0(guildId) ||
        (action === "timeout" && !TIMEOUTS.has(duration)) ||
        !BAN_DELETE.has(del)
      )
        return { ok: false, error: "invalid" };
      if (userId === requesterId) return { ok: false, error: "self" };
      return {
        ok: true,
        input: {
          kind,
          payload: {
            action,
            userId,
            reason: field(form, "reason").slice(0, 512) || null,
            durationSeconds: action === "timeout" ? duration : null,
            deleteMessageSeconds: action === "ban" ? del : 0,
          },
        },
      };
    }
    case "purge": {
      const channelId = field(form, "channelId");
      const amount = Number(field(form, "amount"));
      const userId = field(form, "userId");
      const channels = await listTextChannels(guildId).catch(() => []);
      if (!channels.some((c) => c.id === channelId)) return { ok: false, error: "channel" };
      if (!Number.isInteger(amount) || amount < 1 || amount > 100)
        return { ok: false, error: "invalid" };
      if (userId && !SNOWFLAKE.test(userId)) return { ok: false, error: "invalid" };
      return {
        ok: true,
        input: {
          kind,
          payload: {
            channelId,
            amount,
            userId: userId || null,
            reason: field(form, "reason").slice(0, 512) || null,
          },
        },
      };
    }
    case "create_lfg": {
      const channelId = field(form, "channelId");
      const title = field(form, "title");
      const roles = field(form, "roles");
      const size = Number(field(form, "size") || "0");
      const starts = field(form, "starts") || "now";
      const channels = await listTextChannels(guildId).catch(() => []);
      if (!channels.some((c) => c.id === channelId)) return { ok: false, error: "channel" };
      if (
        !title ||
        title.length > 80 ||
        roles.length > 120 ||
        !Number.isInteger(size) ||
        (size !== 0 && (size < 2 || size > 40)) ||
        !LFG_STARTS.has(starts) ||
        field(form, "templateId").length > 64
      )
        return { ok: false, error: "invalid" };
      return {
        ok: true,
        input: {
          kind,
          payload: {
            channelId,
            title,
            templateId: field(form, "templateId") || null,
            roles: roles || null,
            size: size || null,
            myRole: field(form, "myRole").slice(0, 40) || null,
            starts,
            note: field(form, "note").slice(0, 120) || null,
          },
        },
      };
    }
    case "lfg_join":
    case "lfg_leave": {
      const id = uuid.safeParse(field(form, "id"));
      const p = id.success ? await getLfgPost(db, guildId, id.data) : null;
      if (!p || (p.status !== "open" && p.status !== "full"))
        return { ok: false, error: "not_found" };
      if (kind === "lfg_leave") return { ok: true, input: { kind, payload: { id: p.id } } };
      const role = field(form, "role");
      if (!p.slots.some((g) => g.name === role)) return { ok: false, error: "not_found" };
      return { ok: true, input: { kind, payload: { id: p.id, role } } };
    }
    case "raid_signup":
    case "raid_withdraw": {
      const id = uuid.safeParse(field(form, "eventId"));
      const e = id.success ? await getOpsEvent(db, guildId, id.data) : null;
      if (e?.status !== "scheduled") return { ok: false, error: "not_found" };
      if (kind === "raid_withdraw")
        return { ok: true, input: { kind, payload: { eventId: e.id } } };
      const role = field(form, "role");
      if (!e.slots.some((g) => g.name === role)) return { ok: false, error: "not_found" };
      return {
        ok: true,
        input: {
          kind,
          payload: { eventId: e.id, role, spec: field(form, "spec").slice(0, 20) || null },
        },
      };
    }
    case "qm_plan": {
      const request = field(form, "request");
      if (!request || request.length > 500) return { ok: false, error: "qm_request" };
      return { ok: true, input: { kind, payload: { request } } };
    }
    case "qm_apply":
    case "qm_cancel": {
      const id = uuid.safeParse(field(form, "id"));
      const b = id.success ? await getQmBuild(db, guildId, id.data) : null;
      if (b?.status !== "pending") return { ok: false, error: "not_found" };
      // Same rule as in Discord: whoever asked for a plan is the one who applies it.
      if (kind === "qm_apply" && b.requestedById !== requesterId)
        return { ok: false, error: "qm_not_yours" };
      return { ok: true, input: { kind, payload: { id: b.id } } };
    }
    default:
      return { ok: false, error: "invalid" };
  }
}

export async function requestAction(form: FormData) {
  const access = await checkGuildAccess(field(form, "guildId"));
  if (!access) redirect("/servers");
  const { session, guild } = access;
  const asked = field(form, "page");
  const page = PAGES.has(asked) || MEMBER_PAGE.test(asked) || TICKET_PAGE.test(asked) ? asked : "";
  const base = `/servers/${guild.id}${page ? `/${page}` : ""}`;
  const built = await build(form, guild.id, session.userId);
  if (!built.ok) redirect(`${base}?${new URLSearchParams({ error: built.error })}#requests`);
  const result = await queueDashboardAction(
    await getDb(),
    guild.id,
    { id: session.userId, name: session.username },
    built.input,
  );
  if (!result.ok) redirect(`${base}?${new URLSearchParams({ error: result.reason })}#requests`);
  redirect(`${base}?${new URLSearchParams({ queued: built.input.kind })}#requests`);
}
