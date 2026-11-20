import {
  entitlements,
  getGuildPlan,
  listTwitchSubRoleGuilds,
  twitchSubscriberDiscordIds,
} from "@garrison/db";
import type { Client, Guild } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { rewardProblem } from "../ranks/rules.js";

/**
 * Twitch subscriber roles (best bot item 10). Every 5 minutes, members whose linked Twitch
 * account subscribes to the server's connected channel get its role, and holders who no longer
 * subscribe (or unlinked Twitch) lose it. The list itself comes from Twitch's webhooks, kept by
 * the dashboard. Pro; never a role with moderation powers, a bot's role, or one above Garrison.
 */

const EVERY_MS = 5 * 60_000;
const REASON = "Twitch subscriber role";
let last = 0;

/** Who to give the role and who to take it from. */
export function subRoleChanges(
  subscribers: Set<string>,
  holders: Set<string>,
  members: Set<string>,
) {
  return {
    add: [...subscribers].filter((id) => members.has(id) && !holders.has(id)),
    remove: [...holders].filter((id) => !subscribers.has(id)),
  };
}

async function syncGuild(ctx: BotContext, guild: Guild, broadcasterId: string, roleId: string) {
  if (!entitlements(await getGuildPlan(ctx.db, guild.id))["alerts.subRoles"]) return;
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role || !me) return;
  const problem = rewardProblem(
    {
      id: role.id,
      name: role.name,
      managed: role.managed,
      position: role.position,
      permissions: role.permissions.bitfield,
    },
    guild.roles.everyone.id,
    me.roles.highest.position,
  );
  if (problem) return;
  const subscribers = await twitchSubscriberDiscordIds(ctx.db, broadcasterId);
  const holders = new Set(role.members.keys());
  const present = new Set<string>();
  for (const id of subscribers) {
    if (guild.members.cache.has(id)) present.add(id);
    else if (await guild.members.fetch(id).catch(() => null)) present.add(id);
  }
  const { add, remove } = subRoleChanges(subscribers, holders, present);
  for (const id of add)
    await guild.members.cache
      .get(id)
      ?.roles.add(role, REASON)
      .catch(() => null);
  for (const id of remove)
    await guild.members.cache
      .get(id)
      ?.roles.remove(role, REASON)
      .catch(() => null);
}

export async function sweepSubRoles(ctx: BotContext, client: Client<true>, now = Date.now()) {
  if (now - last < EVERY_MS) return;
  last = now;
  for (const row of await listTwitchSubRoleGuilds(ctx.db)) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild || !row.roleId) continue;
    await syncGuild(ctx, guild, row.broadcasterId, row.roleId).catch((error: unknown) =>
      ctx.logger.warn("Subscriber roles failed", { guildId: guild.id, error }),
    );
  }
}
