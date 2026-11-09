import { createCase, getWatchSettings, type ModCase } from "@garrison/db";
import {
  type Collection,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  PermissionFlagsBits,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { type Actor, postCaseLog } from "./service.js";

const BULK_DELETE_MAX_AGE_MS = 14 * 86_400_000;

export type PurgeResult =
  | { ok: true; case: ModCase; deleted: number }
  | { ok: false; error: string };

/**
 * Bulk-delete up to `amount` of a channel's most recent messages, skipping
 * pinned ones and anything Discord can't bulk-delete, then record the case.
 * Shared by /purge and the dashboard. The caller checks the moderator's own
 * permissions; this checks Garrison's.
 */
export async function purgeMessages(
  ctx: BotContext,
  guild: Guild,
  channel: GuildTextBasedChannel,
  actor: Actor,
  opts: { amount: number; user: { id: string; username: string } | null; reason: string | null },
): Promise<PurgeResult> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory])) {
    return {
      ok: false,
      error: `I can't delete messages in <#${channel.id}>: I'm missing Manage Messages or Read Message History there. Give Garrison both in the channel's permissions.`,
    };
  }
  const fetched: Collection<string, Message> = await channel.messages.fetch({ limit: 100 });
  const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
  const eligible = fetched
    .filter(
      (m) =>
        !m.pinned && m.createdTimestamp > cutoff && (!opts.user || m.author.id === opts.user.id),
    )
    .first(opts.amount);
  const removed = eligible.length ? await channel.bulkDelete(eligible, true) : null;
  const deleted = removed?.size ?? 0;

  await ensureGuild(ctx, guild);
  const created = await createCase(ctx.db, {
    guildId: guild.id,
    action: "purge",
    targetId: opts.user?.id ?? null,
    targetTag: opts.user?.username ?? null,
    moderatorId: actor.id,
    moderatorTag: actor.tag,
    reason: opts.reason,
    details: { channelId: channel.id, deleted, requested: opts.amount },
  });
  await postCaseLog(ctx, guild, await getWatchSettings(ctx.db, guild.id), created);
  return { ok: true, case: created, deleted };
}
