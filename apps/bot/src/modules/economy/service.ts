import {
  adjustBalance,
  buyItem,
  completePurchase,
  dueTimedRoles,
  type EconomyConfig,
  entitlements,
  getEconomy,
  getGuildPlan,
  getPurchase,
  listEnabledEconomies,
  markPurchaseExpired,
  money,
  type Purchase,
  pruneEconomyLedger,
  refundPurchase,
  setPurchaseCard,
} from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  PermissionFlagsBits as P,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { DANGEROUS_PERMISSIONS } from "../gatehouse/nuke.js";

/**
 * The economy in Discord (docs/ECONOMY.md): coins for chatting (once per cooldown), time in
 * voice with someone else and level-ups (Pro), the shop (roles given at once, staff items
 * waiting on a card with Done and Refund), and timed roles taken back when their time is up.
 * Every balance change goes through the database's locked money moves.
 */

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; config: EconomyConfig }>();

export async function economyOf(ctx: BotContext, guildId: string): Promise<EconomyConfig> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.config;
  const config = await getEconomy(ctx.db, guildId);
  cache.set(guildId, { at: Date.now(), config });
  return config;
}

export const OFF =
  "The economy is off in this server. A manager can turn it on from the dashboard.";

const lastChat = new Map<string, number>();
const voiceMinutes = new Map<string, number>();

/** Coins for a message, at most once per cooldown per member. Never throws. */
export async function onEconomyMessage(ctx: BotContext, message: Message) {
  if (!message.inGuild() || message.author.bot || message.webhookId || message.system) return;
  const config = await economyOf(ctx, message.guildId);
  const rules = config.earn.chat;
  if (!config.enabled || !rules.on || rules.max <= 0) return;
  const parent = message.channel.isThread() ? message.channel.parentId : null;
  if (
    config.noEarnChannelIds.includes(message.channelId) ||
    (parent && config.noEarnChannelIds.includes(parent))
  )
    return;
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastChat.get(key) ?? 0) < rules.cooldownSeconds * 1000) return;
  lastChat.set(key, now);
  if (lastChat.size > 50_000) lastChat.clear();
  const amount = rules.min + Math.floor(Math.random() * (rules.max - rules.min + 1));
  if (amount <= 0) return;
  await adjustBalance(ctx.db, {
    guildId: message.guildId,
    userId: message.author.id,
    amount,
    source: "chat",
  });
}

/** Coins at each level reached (Pro). */
export async function onEconomyLevel(
  ctx: BotContext,
  guildId: string,
  userId: string,
  level: number,
) {
  const config = await economyOf(ctx, guildId);
  if (!config.enabled || !config.earn.level.on || config.earn.level.perLevel <= 0) return;
  if (!entitlements(await getGuildPlan(ctx.db, guildId))["economy.extras"]) return;
  await adjustBalance(ctx.db, {
    guildId,
    userId,
    amount: config.earn.level.perLevel,
    source: "level",
    reason: `Level ${level}`,
  });
}

/** Voice (Pro): every minute, members in voice with someone else count a minute; ten pay. */
async function earnVoice(ctx: BotContext, client: Client<true>) {
  const ids = [...client.guilds.cache.keys()];
  for (const { guildId, earn } of await listEnabledEconomies(ctx.db, ids)) {
    if (!earn.voice.on || earn.voice.per10 <= 0) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    if (!entitlements(await getGuildPlan(ctx.db, guildId))["economy.extras"]) continue;
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)
        continue;
      if (channel.id === guild.afkChannelId) continue;
      const people = channel.members.filter((m) => !m.user.bot && !m.voice.selfDeaf);
      if (people.size < 2) continue;
      for (const m of people.values()) {
        const key = `${guildId}:${m.id}`;
        const minutes = (voiceMinutes.get(key) ?? 0) + 1;
        if (minutes < 10) {
          voiceMinutes.set(key, minutes);
          continue;
        }
        voiceMinutes.set(key, 0);
        await adjustBalance(ctx.db, {
          guildId,
          userId: m.id,
          amount: earn.voice.per10,
          source: "voice",
        }).catch((error) => ctx.logger.warn("Voice coins failed", { guildId, error }));
      }
    }
  }
  if (voiceMinutes.size > 50_000) voiceMinutes.clear();
}

/** Timed roles whose time is up: taken back, and the purchase marked expired. */
async function expireRoles(ctx: BotContext, client: Client<true>) {
  for (const p of await dueTimedRoles(ctx.db)) {
    const guild = client.guilds.cache.get(p.guildId);
    if (!guild) continue;
    const member = await guild.members.fetch(p.userId).catch(() => null);
    if (member && p.roleId && member.roles.cache.has(p.roleId))
      await member.roles
        .remove(p.roleId, `Shop: ${p.itemName} ran out`)
        .catch((error) =>
          ctx.logger.warn("Could not take back a shop role", { guildId: guild.id, error }),
        );
    await markPurchaseExpired(ctx.db, p.id);
  }
}

let lastPrune = 0;
let running = false;

/** With the other sweeps, on its own so a slow Discord answer holds nothing up. */
export function sweepEconomy(ctx: BotContext, client: Client<true>) {
  if (running) return;
  running = true;
  void (async () => {
    await earnVoice(ctx, client);
    await expireRoles(ctx, client);
    if (Date.now() - lastPrune > 60 * 60_000) {
      lastPrune = Date.now();
      await pruneEconomyLedger(ctx.db, new Date(Date.now() - 400 * 86_400_000));
    }
  })()
    .catch((error) => ctx.logger.error("Economy sweep failed", { error }))
    .finally(() => {
      running = false;
    });
}

/** The staff card for a hand-delivered item, with Done and Refund while it waits. */
export function purchaseCard(p: Purchase, config: EconomyConfig) {
  const waiting = p.status === "waiting";
  return cardMessage({
    tone: waiting ? "caution" : p.status === "refunded" ? "alert" : "go",
    title: `Shop: ${p.itemName}`,
    status: waiting
      ? "Waiting for staff"
      : p.status === "refunded"
        ? `Refunded by ${p.decidedBy ?? "staff"}`
        : `Handed over by ${p.decidedBy ?? "staff"}`,
    lead: `<@${p.userId}> bought it for ${money(config.currency, p.price)}`,
    actions: waiting
      ? [
          new ButtonBuilder()
            .setCustomId(`eco:done:${p.id}`)
            .setLabel("Done")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`eco:refund:${p.id}`)
            .setLabel("Refund")
            .setStyle(ButtonStyle.Secondary),
        ]
      : [],
    module: "treasury",
    ref: `purchase ${p.id.slice(0, 6)}`,
  });
}

export type Outcome = { ok: boolean; message: string };

/** A role the shop may give: the server's own, no admin or moderation powers, below Garrison. */
async function roleProblem(guild: Guild, roleId: string | null): Promise<string | null> {
  const role = roleId ? guild.roles.cache.get(roleId) : undefined;
  if (!role) return "That item's role was deleted. Ask a manager to fix the shop.";
  if (role.managed || role.permissions.any(DANGEROUS_PERMISSIONS))
    return "That item's role can't be sold: it has admin or moderation powers.";
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(P.ManageRoles) || role.position >= me.roles.highest.position)
    return `Garrison can't give <@&${role.id}>: its role sits below it.`;
  return null;
}

/** Buy from the shop, from /buy or the member page. Every check before the money moves. */
export async function buy(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  itemId: string,
): Promise<Outcome> {
  const config = await economyOf(ctx, guild.id);
  if (!config.enabled) return { ok: false, message: OFF };
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  // On Free, items past the limit (saved on Pro) are paused.
  const item = config.shop.slice(0, ent["economy.items"]).find((i) => i.id === itemId);
  if (!item) return { ok: false, message: "That item isn't in the shop anymore." };
  if (item.needsRoleId && !member.roles.cache.has(item.needsRoleId))
    return {
      ok: false,
      message: `Only members with <@&${item.needsRoleId}> can buy ${item.name}.`,
    };
  if (item.kind === "role") {
    const problem = await roleProblem(guild, item.roleId);
    if (problem) return { ok: false, message: problem };
    if (item.roleId && member.roles.cache.has(item.roleId) && !item.hours)
      return { ok: false, message: `You already have <@&${item.roleId}>.` };
    if (item.hours && !ent["economy.extras"])
      return { ok: false, message: "Roles for a time are paused: the server is back on Free." };
  } else if (!config.staffChannelId) {
    return { ok: false, message: "Staff haven't picked where purchases go yet." };
  }
  const result = await buyItem(
    ctx.db,
    guild.id,
    { id: member.id, username: member.user.username },
    item,
  );
  if (!result.ok)
    return {
      ok: false,
      message:
        result.reason === "insufficient"
          ? `${item.name} costs ${money(config.currency, item.price)}. You have ${money(config.currency, result.balance)}.`
          : result.reason === "sold_out"
            ? `${item.name} is sold out.`
            : `You've bought as many ${item.name} as one member can.`,
    };
  const { purchase, balance } = result;
  if (item.kind === "role") {
    try {
      await member.roles.add(item.roleId as string, `Shop: bought ${item.name}`);
    } catch (error) {
      ctx.logger.warn("Shop role failed; refunding", { guildId: guild.id, error });
      await refundPurchase(ctx.db, guild.id, purchase.id, null, { failed: true });
      return { ok: false, message: "Discord wouldn't give the role, so you weren't charged." };
    }
    return {
      ok: true,
      message: `Bought ${item.name}${item.hours ? ` for ${item.hours} hours` : ""}. You have ${money(config.currency, balance)} left.`,
    };
  }
  const channel = config.staffChannelId ? guild.channels.cache.get(config.staffChannelId) : null;
  if (channel?.isSendable()) {
    const sent = await channel.send(purchaseCard(purchase, config)).catch(() => null);
    if (sent)
      await setPurchaseCard(ctx.db, purchase.id, { channelId: channel.id, messageId: sent.id });
  }
  return {
    ok: true,
    message: `Bought ${item.name}. Staff will hand it over; you have ${money(config.currency, balance)} left.`,
  };
}

/** Staff: hand a waiting item over, or refund it. Only one decision lands. */
export async function decidePurchase(
  ctx: BotContext,
  guild: Guild,
  id: string,
  done: boolean,
  actor: { id: string; name: string },
): Promise<Outcome> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "That purchase isn't here." };
  const row = done
    ? await completePurchase(ctx.db, guild.id, id, actor.name)
    : await refundPurchase(ctx.db, guild.id, id, actor);
  if (!row) return { ok: false, message: "Someone already decided on this purchase." };
  const fresh = (await getPurchase(ctx.db, guild.id, id)) ?? row;
  const config = await economyOf(ctx, guild.id);
  if (fresh.channelId && fresh.messageId) {
    const channel = guild.channels.cache.get(fresh.channelId);
    if (channel?.isTextBased())
      await channel.messages.edit(fresh.messageId, purchaseCard(fresh, config)).catch(() => null);
  }
  return {
    ok: true,
    message: done
      ? `Marked ${fresh.itemName} for ${fresh.username} as handed over.`
      : `Refunded ${money(config.currency, fresh.price)} to ${fresh.username}.`,
  };
}

/** Staff give or take, with a reason, from /money or the dashboard. */
export async function staffAdjust(
  ctx: BotContext,
  guild: Guild,
  input: { userId: string; amount: number; reason: string },
  actor: { id: string; name: string },
): Promise<Outcome> {
  const config = await economyOf(ctx, guild.id);
  if (!config.enabled) return { ok: false, message: OFF };
  const result = await adjustBalance(ctx.db, {
    guildId: guild.id,
    userId: input.userId,
    amount: input.amount,
    source: input.amount > 0 ? "give" : "take",
    reason: input.reason,
    actorId: actor.id,
    actorName: actor.name,
  });
  if (!result.ok)
    return {
      ok: false,
      message: `They only have ${money(config.currency, result.balance)}, so nothing was taken.`,
    };
  return {
    ok: true,
    message: `${input.amount > 0 ? "Gave" : "Took"} ${money(config.currency, Math.abs(input.amount))}. They have ${money(config.currency, result.balance)} now.`,
  };
}
