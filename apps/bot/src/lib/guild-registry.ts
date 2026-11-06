import { upsertGuild } from "@garrison/db";
import type { Guild } from "discord.js";
import type { BotContext } from "../commands/types.js";

const knownGuilds = new Set<string>();

/** Make sure the guild row exists before writing to tables that reference it. Cached per process. */
export async function ensureGuild(ctx: BotContext, guild: Guild) {
  if (knownGuilds.has(guild.id)) return;
  await upsertGuild(ctx.db, { id: guild.id, name: guild.name });
  knownGuilds.add(guild.id);
}

export function forgetGuild(guildId: string) {
  knownGuilds.delete(guildId);
}
