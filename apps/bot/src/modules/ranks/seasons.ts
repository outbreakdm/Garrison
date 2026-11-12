import { endSeason, entitlements, getGuildPlan, SEASON_NAME_MAX } from "@garrison/db";
import type { Guild, GuildMember } from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { safeText } from "../../lib/text.js";
import { cachedRanksSettings } from "./service.js";

type Outcome = { ok: boolean; message: string };

const request = z.object({ name: z.string().max(SEASON_NAME_MAX) });

/**
 * End the season (Pro, asked from the dashboard, Manage Server re-checked by the
 * caller): keep the final standings, reset everyone's XP. Reward roles stay. If
 * level-ups go to one channel, the final top 3 is posted there, without pings.
 */
export async function doSeasonStart(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  if (!entitlements(await getGuildPlan(ctx.db, guild.id))["ranks.seasons"])
    return { ok: false, message: "Seasons are part of Garrison Pro." };
  const p = request.safeParse(raw);
  if (!p.success) return { ok: false, message: "That request wasn't valid." };
  const season = await endSeason(ctx.db, guild.id, {
    name: p.data.name,
    byId: member.id,
    byName: member.displayName,
  });
  if (!season) return { ok: false, message: "Couldn't end the season. Try again." };

  const settings = await cachedRanksSettings(ctx, guild.id);
  if (settings.announce === "channel" && settings.announceChannelId && season.standings.length) {
    const channel = guild.channels.cache.get(settings.announceChannelId);
    const podium = season.standings
      .slice(0, 3)
      .map((s, i) => `${["🥇", "🥈", "🥉"][i]} <@${s.userId}>, level ${s.level}`)
      .join("\n");
    if (channel?.isSendable())
      await channel
        .send(`**${safeText(season.name)} is over.**\n${podium}\nA new season starts now.`)
        .catch(() => {});
  }
  return {
    ok: true,
    message: `${season.name} ended with ${season.members} members ranked. Everyone starts again from 0 XP; reward roles were kept.`,
  };
}
