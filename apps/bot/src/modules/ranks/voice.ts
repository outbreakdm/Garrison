import { awardXp, VOICE_XP } from "@garrison/db";
import type { Client, VoiceState } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { XP_COOLDOWN_MS } from "./rules.js";
import { boostAt, cachedRanksSettings, celebrateLevel } from "./service.js";

/** A little under a minute, so a sweep that runs a moment early still counts. */
const VOICE_COOLDOWN_MS = XP_COOLDOWN_MS - 5_000;

/** Someone actually taking part: a person, not deafened. */
const listening = (s: VoiceState) =>
  !!s.member && !s.member.user.bot && !s.selfDeaf && !s.serverDeaf;

/**
 * Who earns voice XP this minute: in a voice channel that isn't the AFK one, not
 * deafened, with at least one other person there who isn't either.
 */
export function earningVoice(states: Iterable<VoiceState>, afkChannelId: string | null) {
  const byChannel = new Map<string, VoiceState[]>();
  for (const s of states) {
    if (!s.channelId || s.channelId === afkChannelId || !listening(s)) continue;
    byChannel.set(s.channelId, [...(byChannel.get(s.channelId) ?? []), s]);
  }
  return [...byChannel.values()].filter((list) => list.length >= 2).flat();
}

/** The minute sweep: voice XP in servers that turned it on. Shares the message cooldown. */
export async function sweepVoiceXp(ctx: BotContext, client: Client<true>) {
  for (const guild of client.guilds.cache.values()) {
    if (guild.voiceStates.cache.size < 2) continue;
    const settings = await cachedRanksSettings(ctx, guild.id);
    if (!settings.enabled || !settings.voiceXp) continue;
    for (const state of earningVoice(guild.voiceStates.cache.values(), guild.afkChannelId)) {
      const member = state.member;
      const channel = state.channel;
      if (!member || !channel) continue;
      const gain = Math.round(
        VOICE_XP * (await boostAt(ctx, member, { id: channel.id, parentId: channel.parentId })),
      );
      if (gain <= 0) continue;
      const result = await awardXp(
        ctx.db,
        guild.id,
        { id: member.id, username: member.user.username },
        gain,
        VOICE_COOLDOWN_MS,
        new Date(),
        "voice",
      );
      if (result.awarded && result.leveledUpTo)
        await celebrateLevel(ctx, guild, member, member.id, result.leveledUpTo, settings, channel);
    }
  }
}
