import {
  addVoiceRoom,
  entitlements,
  getGuildPlan,
  getVoiceRoom,
  getVoiceRooms,
  listAllVoiceRooms,
  removeVoiceRoom,
  roomName,
  setVoiceRoomOwner,
  type VoiceRoomsConfig,
} from "@garrison/db";
import {
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  OverwriteType,
  PermissionFlagsBits as P,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";

/**
 * Voice rooms (join to create). Joining a creator channel makes the member their own
 * voice channel beside it and moves them in. The owner gets Discord's own controls on
 * that one channel (rename, member limit, who may join). When the owner leaves, the room
 * passes to someone still inside; when the last person leaves, it's deleted.
 */

const SETTINGS_TTL_MS = 30_000;
/** One room per person every few seconds, so hopping in and out can't spam channels. */
const COOLDOWN_MS = 8_000;

const cache = new Map<string, { config: VoiceRoomsConfig; at: number }>();
const lastMade = new Map<string, number>();

export const invalidateVoiceRooms = (guildId: string) => cache.delete(guildId);

async function settings(ctx: BotContext, guildId: string): Promise<VoiceRoomsConfig> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.config;
  const config = await getVoiceRooms(ctx.db, guildId);
  cache.set(guildId, { config, at: Date.now() });
  return config;
}

/**
 * The owner's controls on their own room: rename, limit, decide who may join, move people.
 * Only permissions Garrison holds itself (Discord refuses to let a bot hand out others);
 * speaking comes from the member's roles as usual.
 */
const OWNER_ALLOW = [
  P.ViewChannel,
  P.Connect,
  P.ManageChannels,
  P.MoveMembers,
  P.ManageRoles,
] as const;

async function makeRoom(ctx: BotContext, member: GuildMember, creatorId: string) {
  const guild = member.guild;
  const config = await settings(ctx, guild.id);
  if (!config.enabled) return;
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  // On Free, only the first creator channel and the standard name are used; anything
  // saved under Pro waits, untouched, until the server is Pro again.
  const active = config.creatorChannelIds.slice(0, ent["voice.creators"]);
  if (!active.includes(creatorId)) return;
  const key = `${guild.id}:${member.id}`;
  const last = lastMade.get(key) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  lastMade.set(key, Date.now());

  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has([P.ManageChannels, P.MoveMembers, P.Connect])) {
    ctx.logger.warn("Voice rooms need Manage Channels, Move Members and Connect", {
      guildId: guild.id,
    });
    return;
  }
  const creator = guild.channels.cache.get(creatorId);
  const parent = config.categoryId ?? (creator && "parentId" in creator ? creator.parentId : null);
  const name = roomName(ent["voice.names"] ? config.nameTemplate : null, member.displayName);
  let room: VoiceChannel | null = null;
  try {
    room = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: parent ?? undefined,
      userLimit: config.userLimit || undefined,
      reason: `Voice room for ${member.user.username}`,
      permissionOverwrites: [
        {
          id: me.id,
          type: OverwriteType.Member,
          allow: [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers],
        },
        { id: member.id, type: OverwriteType.Member, allow: [...OWNER_ALLOW] },
      ],
    });
    await addVoiceRoom(ctx.db, {
      channelId: room.id,
      guildId: guild.id,
      ownerId: member.id,
      creatorChannelId: creatorId,
    });
    await member.voice.setChannel(room, "Moved into their new voice room");
  } catch (error) {
    ctx.logger.warn("Could not make a voice room", { guildId: guild.id, error });
    // A room nobody could be moved into is removed straight away.
    if (room && room.members.size === 0) {
      await room.delete("Voice room couldn't be used").catch(() => undefined);
      await removeVoiceRoom(ctx.db, guild.id, room.id).catch(() => undefined);
    }
  }
}

/** Someone left a room: delete it when empty, or hand it on if the owner left. */
async function leftRoom(ctx: BotContext, guild: Guild, channelId: string, leaverId: string) {
  const room = await getVoiceRoom(ctx.db, channelId);
  if (!room) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await removeVoiceRoom(ctx.db, guild.id, channelId);
    return;
  }
  const people = channel.members.filter((m) => !m.user.bot);
  if (people.size === 0) {
    await channel
      .delete("Voice room empty")
      .catch((error) =>
        ctx.logger.warn("Could not delete an empty voice room", { guildId: guild.id, error }),
      );
    await removeVoiceRoom(ctx.db, guild.id, channelId);
    return;
  }
  if (room.ownerId !== leaverId) return;
  const next = people.first();
  if (!next) return;
  try {
    await channel.permissionOverwrites.delete(leaverId, "Voice room owner left");
    await channel.permissionOverwrites.edit(
      next.id,
      Object.fromEntries(OWNER_ALLOW.map((bit) => [permissionName(bit), true])),
      { reason: "Voice room passed to someone still inside" },
    );
    await setVoiceRoomOwner(ctx.db, channelId, next.id);
    if (channel.isSendable())
      await channel.send({
        content: `${next} now owns this room: rename it, set a limit or choose who can join from the channel's settings.`,
        allowedMentions: { users: [next.id] },
      });
  } catch (error) {
    ctx.logger.warn("Could not pass a voice room on", { guildId: guild.id, error });
  }
}

/** discord.js wants permission names in overwrite edits, not bits. */
function permissionName(bit: bigint): keyof typeof P {
  const entry = Object.entries(P).find(([, v]) => v === bit);
  return entry?.[0] as keyof typeof P;
}

export async function onVoiceRoomUpdate(ctx: BotContext, before: VoiceState, after: VoiceState) {
  if (before.channelId === after.channelId) return;
  const member = after.member ?? before.member;
  if (!member || member.user.bot) return;
  if (before.channelId) await leftRoom(ctx, before.guild, before.channelId, member.id);
  if (after.channelId && after.member) await makeRoom(ctx, after.member, after.channelId);
}

/**
 * After a restart (or a missed event): forget rooms whose channel is gone, and delete
 * rooms that have emptied. Runs with the other sweeps.
 */
export async function sweepVoiceRooms(ctx: BotContext, client: Client<true>) {
  for (const room of await listAllVoiceRooms(ctx.db)) {
    const guild = client.guilds.cache.get(room.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(room.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await removeVoiceRoom(ctx.db, guild.id, room.channelId);
      continue;
    }
    // A minute's grace, so a room just made isn't deleted before its owner arrives.
    if (Date.now() - room.createdAt.getTime() < 60_000) continue;
    if (channel.members.filter((m) => !m.user.bot).size === 0) {
      await channel.delete("Voice room empty").catch(() => undefined);
      await removeVoiceRoom(ctx.db, guild.id, room.channelId);
    }
  }
}
