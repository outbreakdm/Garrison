import {
  type BackupChannel,
  backupsKept,
  entitlements,
  getBackup,
  getGuildPlan,
  listWeeklyBackupsDue,
  maskPermissions,
  RESTORE_MAX,
  readBackup,
  recordRestore,
  restorePlan,
  type ServerBackup,
  saveBackup,
} from "@garrison/db";
import {
  ChannelType,
  type Client,
  type Guild,
  type GuildChannelCreateOptions,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";

/**
 * Backups: a snapshot of roles, categories, channels and their overwrites. Restore
 * recreates only what's missing (backups.ts works out what), with permissions
 * limited to what Garrison itself holds, and is owner-only like anti-nuke.
 */

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

/** The server as it is now. Managed roles (integrations, boosts) and @everyone are left out. */
export function snapshot(guild: Guild): ServerBackup {
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.bitfield.toString(),
      position: r.position,
    }));
  const channels: BackupChannel[] = [];
  for (const c of guild.channels.cache.values()) {
    if (c.isThread() || !("permissionOverwrites" in c)) continue;
    channels.push({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId,
      position: "rawPosition" in c ? c.rawPosition : 0,
      topic: "topic" in c && typeof c.topic === "string" ? c.topic : null,
      nsfw: "nsfw" in c && c.nsfw === true,
      rateLimit:
        "rateLimitPerUser" in c && typeof c.rateLimitPerUser === "number" ? c.rateLimitPerUser : 0,
      userLimit: "userLimit" in c && typeof c.userLimit === "number" ? c.userLimit : 0,
      overwrites: [...c.permissionOverwrites.cache.values()].map((o) => ({
        id: o.id,
        kind: o.type === OverwriteType.Member ? ("member" as const) : ("role" as const),
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
      })),
    });
  }
  return { version: 1, roles, channels };
}

async function take(
  ctx: BotContext,
  guild: Guild,
  kind: "manual" | "weekly",
  by: GuildMember | null,
) {
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const data = snapshot(guild);
  await saveBackup(
    ctx.db,
    {
      guildId: guild.id,
      kind,
      createdById: by?.id ?? null,
      createdByName: by?.displayName ?? null,
      data,
    },
    backupsKept(ent),
  );
  return data;
}

export async function doBackupCreate(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
): Promise<Outcome> {
  const data = await take(ctx, guild, "manual", member);
  return {
    ok: true,
    message: `Backed up ${data.roles.length} roles and ${data.channels.length} channels.`,
  };
}

/** What Discord accepts when creating; the types that need Community fall back to their plain kind. */
function createType(type: number, community: boolean) {
  if (type === ChannelType.GuildCategory) return ChannelType.GuildCategory;
  if (type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice)
    return type === ChannelType.GuildStageVoice && community
      ? ChannelType.GuildStageVoice
      : ChannelType.GuildVoice;
  if ((type === ChannelType.GuildAnnouncement || type === ChannelType.GuildForum) && community)
    return type;
  return ChannelType.GuildText;
}

const restoreReq = z.object({ backupId: z.string().uuid() });

/** Owner only (checked here against Discord): recreate what's missing from a backup. */
export async function doBackupRestore(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  if (member.id !== guild.ownerId) return fail("Only the server owner can restore a backup.");
  const p = restoreReq.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const row = await getBackup(ctx.db, guild.id, p.data.backupId);
  if (!row) return fail("That backup was removed.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels]))
    return fail("Garrison needs Manage Roles and Manage Channels to restore.");
  const backup = readBackup(row.data);
  const plan = restorePlan(
    backup,
    {
      roleIds: new Set(guild.roles.cache.keys()),
      channelIds: new Set(guild.channels.cache.keys()),
    },
    row.restoredMap,
  );
  const allowed = me.permissions.bitfield;
  const map: Record<string, string> = { ...row.restoredMap };
  const newId = (id: string) => map[id] ?? id;
  const reason = `Restore of backup from ${row.createdAt.toISOString().slice(0, 10)}`;
  let reduced = 0;
  let failed = 0;

  // Roles first, lowest first so they stack in the backup's order under Garrison's role.
  for (const r of plan.roles) {
    const perms = maskPermissions(r.permissions, allowed);
    if (perms.dropped) reduced++;
    const made = await guild.roles
      .create({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: perms.kept,
        reason,
      })
      .catch(() => null);
    if (made) map[r.id] = made.id;
    else failed++;
  }

  const community = guild.features.includes("COMMUNITY");
  const overwrites = (c: BackupChannel) =>
    c.overwrites.flatMap((o) => {
      // A role recreated by this or an earlier restore has a new ID; @everyone keeps the server's.
      const target = newId(o.id);
      const exists = o.kind === "member" || target === guild.id || guild.roles.cache.has(target);
      if (!exists) return [];
      const allow = maskPermissions(o.allow, allowed);
      const deny = maskPermissions(o.deny, allowed);
      if (allow.dropped || deny.dropped) reduced++;
      return [
        {
          id: target,
          type: o.kind === "member" ? OverwriteType.Member : OverwriteType.Role,
          allow: allow.kept,
          deny: deny.kept,
        },
      ];
    });
  const create = async (c: BackupChannel) => {
    const parent = c.parentId ? newId(c.parentId) : null;
    const options: GuildChannelCreateOptions = {
      name: c.name,
      type: createType(c.type, community) as GuildChannelCreateOptions["type"],
      parent: parent && guild.channels.cache.has(parent) ? parent : null,
      permissionOverwrites: overwrites(c),
      reason,
    };
    if (c.topic) options.topic = c.topic;
    if (c.nsfw) options.nsfw = true;
    if (c.rateLimit) options.rateLimitPerUser = c.rateLimit;
    if (c.userLimit) options.userLimit = c.userLimit;
    const made = await guild.channels.create(options).catch(() => null);
    if (made) map[c.id] = made.id;
    else failed++;
  };
  for (const c of plan.categories) await create(c);
  for (const c of plan.channels) await create(c);

  await recordRestore(ctx.db, row.id, map);
  const made = Object.keys(map).length - Object.keys(row.restoredMap).length;
  const notes = [
    reduced ? `${reduced} permission sets were trimmed to what Garrison holds.` : "",
    failed ? `${failed} couldn't be made.` : "",
    plan.skipped ? `${plan.skipped} were left for another run (${RESTORE_MAX} at a time).` : "",
  ].filter(Boolean);
  if (!made && !failed)
    return { ok: true, message: "Nothing was missing: everything in that backup is still there." };
  return {
    ok: failed === 0,
    message: `Recreated ${made} roles and channels. ${notes.join(" ")}`.trim(),
  };
}

/** The minute sweep: weekly backups for Pro servers that turned them on. */
export async function sweepWeeklyBackups(ctx: BotContext, client: Client<true>, now = new Date()) {
  for (const { guildId } of await listWeeklyBackupsDue(ctx.db, now)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
    if (!ent["backups.weekly"]) continue;
    await take(ctx, guild, "weekly", null).catch((error: unknown) =>
      ctx.logger.warn("Weekly backup failed", { guildId, error }),
    );
  }
}
