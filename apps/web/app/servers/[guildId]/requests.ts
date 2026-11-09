"use server";

import {
  getCase,
  getLfgPost,
  getOpsEvent,
  getQmBuildByVersion,
  getQuarantine,
  type QueueInput,
  queueDashboardAction,
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

const PAGES = new Set(["", "gatehouse", "watch", "rally", "quartermaster"]);
const LOCK_MINUTES = new Set([0, 15, 30, 60, 120, 360, 1440]);
const uuid = z.string().uuid();

type Built = { ok: true; input: QueueInput } | { ok: false; error: string };

const field = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

async function build(form: FormData, guildId: string, userId: string): Promise<Built> {
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
    case "anti_nuke": {
      // Owner only, asked of Discord now; the bot asks again before applying.
      const owner = await guildOwnerId(guildId).catch(() => null);
      if (!owner || owner !== userId) return { ok: false, error: "owner_only" };
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
    default:
      return { ok: false, error: "invalid" };
  }
}

export async function requestAction(form: FormData) {
  const access = await checkGuildAccess(field(form, "guildId"));
  if (!access) redirect("/servers");
  const { session, guild } = access;
  const page = PAGES.has(field(form, "page")) ? field(form, "page") : "";
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
