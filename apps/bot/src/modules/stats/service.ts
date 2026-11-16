import {
  entitlements,
  getGuildPlan,
  getServerStats,
  listStatChannels,
  listStatsGuilds,
  needsMemberList,
  removeStatChannels,
  STATS_CATEGORY_NAME,
  STATS_RENAME_MS,
  type StatChannel,
  type StatCounter,
  saveStatChannel,
  statName,
} from "@garrison/db";
import {
  ChannelType,
  type Client,
  type Guild,
  type GuildBasedChannel,
  OverwriteType,
  PermissionFlagsBits as P,
  type StageChannel,
  type VoiceChannel,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";

/**
 * Server stats: voice channels nobody can join, named with a live count ("Members: 372").
 * Each minute it works out every counter; a channel is renamed only when its number
 * changed and at most once every ten minutes (Discord allows two renames in ten). Channels
 * Garrison made are deleted when their counter is removed or the module is switched off;
 * channels the owner picked are left as they are.
 */

const CATEGORY_KEY = "_category";
/** Members are fetched once, then kept current by join and leave events; again after this. */
const MEMBERS_REFRESH_MS = 6 * 60 * 60_000;
const membersFetched = new Map<string, number>();
let running = false;

async function memberList(guild: Guild): Promise<boolean> {
  const at = membersFetched.get(guild.id) ?? 0;
  if (Date.now() - at < MEMBERS_REFRESH_MS) return true;
  try {
    await guild.members.fetch({ time: 60_000 });
    membersFetched.set(guild.id, Date.now());
    return true;
  } catch {
    return false;
  }
}

/** Each counter's number now; null when it can't be known this round. */
function count(guild: Guild, c: StatCounter, haveMembers: boolean): number | null {
  switch (c.kind) {
    case "members":
      return guild.memberCount;
    case "humans":
      return haveMembers ? guild.members.cache.filter((m) => !m.user.bot).size : null;
    case "bots":
      return haveMembers ? guild.members.cache.filter((m) => m.user.bot).size : null;
    case "role": {
      const role = c.roleId ? guild.roles.cache.get(c.roleId) : undefined;
      return haveMembers && role ? role.members.size : null;
    }
    case "boosts":
      return guild.premiumSubscriptionCount ?? 0;
    case "channels":
      return guild.channels.cache.filter(
        (ch) => !ch.isThread() && ch.type !== ChannelType.GuildCategory,
      ).size;
    case "roles":
      return Math.max(0, guild.roles.cache.size - 1);
  }
}

const isVoice = (ch: GuildBasedChannel | undefined): ch is VoiceChannel | StageChannel =>
  ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice;

/** The category Garrison's channels go in: the owner's pick, or one Garrison makes. */
async function categoryFor(
  ctx: BotContext,
  guild: Guild,
  categoryId: string | null,
  records: Map<string, StatChannel>,
): Promise<string> {
  const picked = categoryId ? guild.channels.cache.get(categoryId) : undefined;
  if (picked?.type === ChannelType.GuildCategory) return picked.id;
  const ours = records.get(CATEGORY_KEY);
  const existing = ours ? guild.channels.cache.get(ours.channelId) : undefined;
  if (existing?.type === ChannelType.GuildCategory) return existing.id;
  const made = await guild.channels.create({
    name: STATS_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    position: 0,
    reason: "Server stats",
  });
  await saveStatChannel(ctx.db, {
    guildId: guild.id,
    counterKey: CATEGORY_KEY,
    channelId: made.id,
    made: true,
    name: made.name,
    count: null,
    renamed: true,
  });
  records.set(CATEGORY_KEY, {
    guildId: guild.id,
    counterKey: CATEGORY_KEY,
    channelId: made.id,
    made: true,
    name: made.name,
    count: null,
    renamedAt: new Date(),
  });
  return made.id;
}

async function updateGuild(ctx: BotContext, guild: Guild) {
  const [config, rows, plan] = await Promise.all([
    getServerStats(ctx.db, guild.id),
    listStatChannels(ctx.db, guild.id),
    getGuildPlan(ctx.db, guild.id),
  ]);
  const records = new Map(rows.map((r) => [r.counterKey, r]));
  const limit = entitlements(plan)["stats.counters"];
  // On Free, counters saved under Pro past the limit wait, untouched, until Pro returns.
  const active = config.enabled ? config.counters.slice(0, limit) : [];
  const paused = new Set(config.enabled ? config.counters.slice(limit).map((c) => c.key) : []);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has([P.ManageChannels, P.ViewChannel, P.Connect])) {
    ctx.logger.warn("Server stats need Manage Channels, View Channel and Connect", {
      guildId: guild.id,
    });
    return;
  }

  // Removed counters: delete the channels Garrison made; leave the owner's own.
  const keep = new Set([...active.map((c) => c.key), ...paused]);
  const gone = rows.filter((r) => r.counterKey !== CATEGORY_KEY && !keep.has(r.counterKey));
  for (const r of gone) {
    const ch = guild.channels.cache.get(r.channelId);
    if (r.made && ch) await ch.delete("Server stats counter removed").catch(() => undefined);
  }
  await removeStatChannels(
    ctx.db,
    guild.id,
    gone.map((r) => r.counterKey),
  );
  for (const r of gone) records.delete(r.counterKey);

  const haveMembers = needsMemberList(active) ? await memberList(guild) : false;
  for (const c of active) {
    const value = count(guild, c, haveMembers);
    const role = c.roleId ? guild.roles.cache.get(c.roleId) : undefined;
    const name = statName(c.template, value, role?.name);
    const rec = records.get(c.key);
    try {
      if (c.channelId) {
        // The owner's own channel: a channel Garrison made for this counter before goes.
        if (rec?.made && rec.channelId !== c.channelId)
          await guild.channels.cache
            .get(rec.channelId)
            ?.delete("Server stats now uses another channel")
            .catch(() => undefined);
        const own = guild.channels.cache.get(c.channelId);
        if (!own || !isVoice(own)) continue;
        await rename(
          ctx,
          guild,
          c,
          own,
          rec?.channelId === own.id ? rec : undefined,
          name,
          value,
          false,
        );
        continue;
      }
      const parent = await categoryFor(ctx, guild, config.categoryId, records);
      const existing = rec?.made ? guild.channels.cache.get(rec.channelId) : undefined;
      if (existing && isVoice(existing)) {
        if (existing.parentId !== parent)
          await existing.setParent(parent, { lockPermissions: false, reason: "Server stats" });
        await rename(ctx, guild, c, existing, rec, name, value, true);
        continue;
      }
      const made = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        parent,
        reason: "Server stats",
        permissionOverwrites: [
          { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.Connect] },
          {
            id: me.id,
            type: OverwriteType.Member,
            allow: [P.ViewChannel, P.Connect, P.ManageChannels],
          },
        ],
      });
      await saveStatChannel(ctx.db, {
        guildId: guild.id,
        counterKey: c.key,
        channelId: made.id,
        made: true,
        name,
        count: value,
        renamed: true,
      });
    } catch (error) {
      ctx.logger.warn("Server stats counter failed", { guildId: guild.id, error });
    }
  }

  // Switched off, or nothing of Garrison's left in it: the category Garrison made goes too.
  const cat = records.get(CATEGORY_KEY);
  const usesOurs = active.some((c) => !c.channelId) && !config.categoryId;
  if (cat && !usesOurs && !paused.size) {
    const ch = guild.channels.cache.get(cat.channelId);
    const empty = !guild.channels.cache.some((x) => x.parentId === cat.channelId);
    if (ch && empty) await ch.delete("Server stats switched off").catch(() => undefined);
    if (!ch || empty) await removeStatChannels(ctx.db, guild.id, [CATEGORY_KEY]);
  }
}

/** Rename when the number changed and the channel hasn't been renamed in ten minutes. */
async function rename(
  ctx: BotContext,
  guild: Guild,
  c: StatCounter,
  channel: VoiceChannel | StageChannel,
  rec: StatChannel | undefined,
  name: string,
  value: number | null,
  made: boolean,
) {
  if (value === null) return;
  const due = !rec || Date.now() - rec.renamedAt.getTime() >= STATS_RENAME_MS;
  const renamed = channel.name !== name && due;
  if (renamed) await channel.edit({ name, reason: "Server stats" });
  if (!rec || renamed || rec.count !== value || rec.channelId !== channel.id || rec.made !== made)
    await saveStatChannel(ctx.db, {
      guildId: guild.id,
      counterKey: c.key,
      channelId: channel.id,
      made,
      name: renamed ? name : channel.name,
      count: value,
      renamed,
    });
}

/**
 * Runs with the other sweeps but never holds them up: a rename Discord makes wait is
 * waited out here, on its own.
 */
export function sweepServerStats(ctx: BotContext, client: Client<true>) {
  if (running) return;
  running = true;
  void (async () => {
    const ids = await listStatsGuilds(ctx.db, [...client.guilds.cache.keys()]);
    for (const id of ids) {
      const guild = client.guilds.cache.get(id);
      if (!guild?.available) continue;
      await updateGuild(ctx, guild).catch((error) =>
        ctx.logger.warn("Server stats failed", { guildId: id, error }),
      );
    }
  })()
    .catch((error) => ctx.logger.error("Server stats sweep failed", { error }))
    .finally(() => {
      running = false;
    });
}
