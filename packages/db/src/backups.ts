/**
 * Server backups: roles, categories and channels with their permission
 * overwrites, as a snapshot. Restore is additive: it recreates what's missing and
 * never deletes or edits what's there, so it's safe to run after a nuke and safe
 * to run twice (a backup remembers what it recreated). Pure: the plan is worked
 * out here, the bot applies it.
 *
 * Free keeps 1 manual backup; Pro keeps 30 and can take one weekly by itself.
 */

import type { Entitlements } from "./plans";

export interface BackupRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  /** Permission bits as a decimal string. */
  permissions: string;
  position: number;
}

export interface BackupOverwrite {
  id: string;
  kind: "role" | "member";
  allow: string;
  deny: string;
}

export interface BackupChannel {
  id: string;
  name: string;
  /** Discord's channel type: 0 text, 2 voice, 4 category, 5 announcement, 13 stage, 15 forum. */
  type: number;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  rateLimit: number;
  userLimit: number;
  overwrites: BackupOverwrite[];
}

export interface ServerBackup {
  version: 1;
  roles: BackupRole[];
  channels: BackupChannel[];
}

/** How many backups a server keeps on this plan. */
export const backupsKept = (ent: Entitlements) => ent["backups.kept"];
/** Most objects one restore recreates, so a huge backup can't stall the bot for hours. */
export const RESTORE_MAX = 250;

/** Read a stored snapshot leniently: anything malformed is left out. */
export function readBackup(raw: unknown): ServerBackup {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 100) => (typeof v === "string" ? v.slice(0, max) : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const bits = (v: unknown) => (typeof v === "string" && /^\d{1,20}$/.test(v) ? v : "0");
  const id = (v: unknown) => (typeof v === "string" && /^\d{17,20}$/.test(v) ? v : null);
  const roles = (Array.isArray(r.roles) ? r.roles : []).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const rid = id(o.id);
    return rid
      ? [
          {
            id: rid,
            name: str(o.name) || "role",
            color: num(o.color),
            hoist: o.hoist === true,
            mentionable: o.mentionable === true,
            permissions: bits(o.permissions),
            position: num(o.position),
          },
        ]
      : [];
  });
  const channels = (Array.isArray(r.channels) ? r.channels : []).flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const cid = id(o.id);
    if (!cid) return [];
    const overwrites = (Array.isArray(o.overwrites) ? o.overwrites : []).flatMap((w) => {
      const v = (w ?? {}) as Record<string, unknown>;
      const oid = id(v.id);
      return oid
        ? [
            {
              id: oid,
              kind: v.kind === "member" ? ("member" as const) : ("role" as const),
              allow: bits(v.allow),
              deny: bits(v.deny),
            },
          ]
        : [];
    });
    return [
      {
        id: cid,
        name: str(o.name) || "channel",
        type: num(o.type),
        parentId: id(o.parentId),
        position: num(o.position),
        topic: str(o.topic, 1024) || null,
        nsfw: o.nsfw === true,
        rateLimit: num(o.rateLimit),
        userLimit: num(o.userLimit),
        overwrites,
      },
    ];
  });
  return { version: 1, roles, channels };
}

export interface RestorePlan {
  roles: BackupRole[];
  categories: BackupChannel[];
  channels: BackupChannel[];
  /** Left out because a restore makes at most RESTORE_MAX objects. */
  skipped: number;
}

/**
 * What a restore would recreate: roles and channels from the backup that aren't
 * in the server now, by ID, counting anything an earlier restore already
 * recreated (`restored`: backup ID → new ID) as there.
 */
export function restorePlan(
  backup: ServerBackup,
  now: { roleIds: Set<string>; channelIds: Set<string> },
  restored: Record<string, string> = {},
): RestorePlan {
  const present = (id: string, ids: Set<string>) =>
    ids.has(id) || (restored[id] !== undefined && ids.has(restored[id] as string));
  const roles = backup.roles
    .filter((r) => !present(r.id, now.roleIds))
    .sort((a, b) => a.position - b.position);
  const missing = backup.channels
    .filter((c) => !present(c.id, now.channelIds))
    .sort((a, b) => a.position - b.position);
  const categories = missing.filter((c) => c.type === 4);
  const channels = missing.filter((c) => c.type !== 4);
  const total = roles.length + categories.length + channels.length;
  if (total <= RESTORE_MAX) return { roles, categories, channels, skipped: 0 };
  // Roles and categories first: channels need them.
  const r = roles.slice(0, RESTORE_MAX);
  const c = categories.slice(0, Math.max(0, RESTORE_MAX - r.length));
  const ch = channels.slice(0, Math.max(0, RESTORE_MAX - r.length - c.length));
  return {
    roles: r,
    categories: c,
    channels: ch,
    skipped: total - r.length - c.length - ch.length,
  };
}

/** Permission bits Garrison may set: only those it has itself (Discord's rule). */
export function maskPermissions(bits: string, allowed: bigint) {
  const want = BigInt(bits);
  const kept = want & allowed;
  return { kept, dropped: want !== kept };
}
