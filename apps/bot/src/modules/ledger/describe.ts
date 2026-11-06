import { AuditLogEvent } from "discord.js";
import { permissionNames } from "../gatehouse/nuke.js";

/** One audit-log change, as Discord sends it. */
export interface Change {
  key: string;
  old?: unknown;
  new?: unknown;
}

export interface AuditInput {
  action: AuditLogEvent;
  executorId: string | null;
  targetId: string | null;
  changes: Change[];
  reason: string | null;
  extra?: { channelId?: string; count?: number } | null;
}

export interface LedgerDraft {
  type: string;
  summary: string;
  actorId: string | null;
  targetId: string | null;
  channelId: string | null;
  data: Record<string, unknown>;
}

const get = (changes: Change[], key: string) => changes.find((c) => c.key === key);
const names = (v: unknown) =>
  Array.isArray(v)
    ? v.map((r) => (r && typeof r === "object" && "name" in r ? String(r.name) : "?")).join(", ")
    : "";
const str = (v: unknown) => (v === null || v === undefined || v === "" ? "none" : String(v));

function permissionDelta(changes: Change[]) {
  const c = get(changes, "permissions");
  if (!c) return null;
  const before = BigInt(String(c.old ?? "0"));
  const after = BigInt(String(c.new ?? "0"));
  const added = after & ~before;
  const removed = before & ~after;
  const parts = [];
  if (added) parts.push(`gave ${permissionNames(added)}`);
  if (removed) parts.push(`took ${permissionNames(removed)}`);
  return parts.join("; ") || null;
}

type Describer = (a: AuditInput) => { type: string; summary: string } | null;

const DESCRIBE: Partial<Record<AuditLogEvent, Describer>> = {
  [AuditLogEvent.MemberKick]: () => ({ type: "member_kick", summary: "Kicked" }),
  [AuditLogEvent.MemberBanAdd]: () => ({ type: "member_ban", summary: "Banned" }),
  [AuditLogEvent.MemberBanRemove]: () => ({ type: "member_unban", summary: "Unbanned" }),
  [AuditLogEvent.MemberRoleUpdate]: (a) => {
    const add = names(get(a.changes, "$add")?.new);
    const remove = names(get(a.changes, "$remove")?.new);
    const parts = [add && `Added ${add}`, remove && `Removed ${remove}`].filter(Boolean);
    return parts.length ? { type: "member_roles", summary: parts.join("; ") } : null;
  },
  [AuditLogEvent.MemberUpdate]: (a) => {
    const nick = get(a.changes, "nick");
    const timeout = get(a.changes, "communication_disabled_until");
    if (timeout) {
      return timeout.new
        ? {
            type: "member_timeout",
            summary: `Timed out until ${new Date(String(timeout.new)).toISOString().slice(0, 16).replace("T", " ")} UTC`,
          }
        : { type: "member_timeout_end", summary: "Timeout removed" };
    }
    if (nick)
      return { type: "member_nick", summary: `Nickname ${str(nick.old)} → ${str(nick.new)}` };
    return null;
  },
  [AuditLogEvent.ChannelCreate]: (a) => ({
    type: "channel_create",
    summary: `Created #${str(get(a.changes, "name")?.new)}`,
  }),
  [AuditLogEvent.ChannelDelete]: (a) => ({
    type: "channel_delete",
    summary: `Deleted #${str(get(a.changes, "name")?.old)}`,
  }),
  [AuditLogEvent.ChannelUpdate]: (a) => {
    const name = get(a.changes, "name");
    return {
      type: "channel_update",
      summary: name ? `Renamed #${str(name.old)} → #${str(name.new)}` : "Edited channel settings",
    };
  },
  [AuditLogEvent.ChannelOverwriteCreate]: () => ({
    type: "channel_permissions",
    summary: "Added a permission override",
  }),
  [AuditLogEvent.ChannelOverwriteUpdate]: (a) => ({
    type: "channel_permissions",
    summary: permissionDelta(a.changes)
      ? `Changed a permission override: ${permissionDelta(a.changes)}`
      : "Changed a permission override",
  }),
  [AuditLogEvent.ChannelOverwriteDelete]: () => ({
    type: "channel_permissions",
    summary: "Removed a permission override",
  }),
  [AuditLogEvent.RoleCreate]: (a) => ({
    type: "role_create",
    summary: `Created role ${str(get(a.changes, "name")?.new)}`,
  }),
  [AuditLogEvent.RoleDelete]: (a) => ({
    type: "role_delete",
    summary: `Deleted role ${str(get(a.changes, "name")?.old)}`,
  }),
  [AuditLogEvent.RoleUpdate]: (a) => {
    const perms = permissionDelta(a.changes);
    const name = get(a.changes, "name");
    const parts = [
      name && `Renamed ${str(name.old)} → ${str(name.new)}`,
      perms && `Permissions: ${perms}`,
    ].filter(Boolean);
    return { type: "role_update", summary: parts.length ? parts.join("; ") : "Edited a role" };
  },
  [AuditLogEvent.InviteCreate]: (a) => ({
    type: "invite_create",
    summary: `Created invite ${str(get(a.changes, "code")?.new)}`,
  }),
  [AuditLogEvent.InviteDelete]: (a) => ({
    type: "invite_delete",
    summary: `Deleted invite ${str(get(a.changes, "code")?.old)}`,
  }),
  [AuditLogEvent.WebhookCreate]: (a) => ({
    type: "webhook_create",
    summary: `Created webhook ${str(get(a.changes, "name")?.new)}`,
  }),
  [AuditLogEvent.WebhookDelete]: (a) => ({
    type: "webhook_delete",
    summary: `Deleted webhook ${str(get(a.changes, "name")?.old)}`,
  }),
  [AuditLogEvent.BotAdd]: () => ({ type: "bot_add", summary: "Added a bot" }),
  [AuditLogEvent.GuildUpdate]: (a) => ({
    type: "server_update",
    summary: `Edited server settings: ${a.changes.map((c) => c.key).join(", ") || "unknown"}`,
  }),
  [AuditLogEvent.MessageDelete]: (a) => ({
    type: "message_delete_by_mod",
    summary: `Deleted ${a.extra?.count ?? 1} message${(a.extra?.count ?? 1) === 1 ? "" : "s"} by someone else`,
  }),
  [AuditLogEvent.MessageBulkDelete]: (a) => ({
    type: "message_bulk_delete",
    summary: `Bulk-deleted ${a.extra?.count ?? "?"} messages`,
  }),
  [AuditLogEvent.MemberDisconnect]: (a) => ({
    type: "voice_disconnect",
    summary: `Disconnected ${a.extra?.count ?? 1} from voice`,
  }),
  [AuditLogEvent.MemberMove]: (a) => ({
    type: "voice_move",
    summary: `Moved ${a.extra?.count ?? 1} in voice`,
  }),
};

/** Turn an audit-log entry into a ledger event, or null for actions we don't log. Never includes message content. */
export function describeAudit(a: AuditInput): LedgerDraft | null {
  const d = DESCRIBE[a.action]?.(a);
  if (!d) return null;
  const reason = a.reason ? a.reason.slice(0, 300) : null;
  return {
    type: d.type,
    summary: d.summary.slice(0, 300),
    actorId: a.executorId,
    targetId: a.targetId,
    channelId: a.extra?.channelId ?? null,
    data: reason ? { reason } : {},
  };
}

export { ledgerTypeLabels as TYPE_LABELS } from "@garrison/brand";
