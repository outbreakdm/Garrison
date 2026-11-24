import {
  claimDaily,
  coinNumber,
  ECONOMY_LIMITS,
  entitlements,
  getGuildPlan,
  getWallet,
  money,
  parseAmount,
  payMember,
  topWallets,
  walletRank,
} from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { BotContext, ButtonHandler, Command } from "../../commands/types.js";
import { cardReply } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { shopForm } from "./panel.js";
import { buy, decidePurchase, economyOf, OFF, staffAdjust } from "./service.js";

/** One economy command per member every 3 seconds, so nobody hammers the database. */
const lastUse = new Map<string, number>();
function tooFast(userId: string) {
  const now = Date.now();
  if (now - (lastUse.get(userId) ?? 0) < 3000) return true;
  lastUse.set(userId, now);
  if (lastUse.size > 20_000) lastUse.clear();
  return false;
}
const SLOW = { content: "One at a time: try again in a few seconds.", ...ephemeral };

export const balance: Command = {
  data: guildCommand("balance", "See your balance, or another member's.", null)
    .addUserOption((o) => o.setName("member").setDescription("Whose balance").setRequired(false))
    .toJSON(),
  async execute(interaction, ctx) {
    if (tooFast(interaction.user.id)) return void (await interaction.reply(SLOW));
    const config = await economyOf(ctx, interaction.guildId);
    if (!config.enabled) return void (await interaction.reply({ content: OFF, ...ephemeral }));
    const user = interaction.options.getUser("member") ?? interaction.user;
    const wallet = await getWallet(ctx.db, interaction.guildId, user.id);
    const rank = await walletRank(ctx.db, interaction.guildId, wallet.balance);
    await interaction.reply(
      cardReply({
        title: user.id === interaction.user.id ? "Your balance" : `${user.username}'s balance`,
        status: money(config.currency, wallet.balance),
        lead: wallet.balance > 0 ? `#${coinNumber(rank)} in the server` : undefined,
        blocks:
          user.id === interaction.user.id && config.earn.daily.on
            ? [
                {
                  text:
                    wallet.streak > 1
                      ? `Daily streak: ${wallet.streak} days.`
                      : "Claim /daily once a day.",
                },
              ]
            : [],
        module: "treasury",
      }),
    );
  },
};

export const daily: Command = {
  data: guildCommand("daily", "Claim today's coins.", null).toJSON(),
  async execute(interaction, ctx) {
    if (tooFast(interaction.user.id)) return void (await interaction.reply(SLOW));
    const config = await economyOf(ctx, interaction.guildId);
    if (!config.enabled) return void (await interaction.reply({ content: OFF, ...ephemeral }));
    if (!config.earn.daily.on)
      return void (await interaction.reply({
        content: "This server has no daily claim.",
        ...ephemeral,
      }));
    const result = await claimDaily(
      ctx.db,
      interaction.guildId,
      interaction.user.id,
      config.earn.daily,
    );
    if (!result.ok)
      return void (await interaction.reply({
        content: `You've claimed today's. Next one <t:${Math.floor(result.next.getTime() / 1000)}:R>.`,
        ...ephemeral,
      }));
    await interaction.reply({
      content: `+${money(config.currency, result.amount)}${result.streak > 1 ? ` · ${result.streak}-day streak` : ""}. You have ${money(config.currency, result.balance)}.`,
      ...ephemeral,
    });
  },
};

export const pay: Command = {
  data: guildCommand("pay", "Pay another member.", null)
    .addUserOption((o) => o.setName("member").setDescription("Who to pay").setRequired(true))
    .addStringOption((o) =>
      o.setName("amount").setDescription("How much").setRequired(true).setMaxLength(13),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    if (tooFast(interaction.user.id)) return void (await interaction.reply(SLOW));
    const config = await economyOf(ctx, interaction.guildId);
    if (!config.enabled) return void (await interaction.reply({ content: OFF, ...ephemeral }));
    if (!config.earn.pay.on)
      return void (await interaction.reply({
        content: "Paying other members is off here.",
        ...ephemeral,
      }));
    const to = interaction.options.getUser("member", true);
    if (to.bot || to.id === interaction.user.id)
      return void (await interaction.reply({
        content: "Pay another member, not a bot or yourself.",
        ...ephemeral,
      }));
    const amount = parseAmount(interaction.options.getString("amount", true));
    if (!amount)
      return void (await interaction.reply({
        content: "Pay a whole amount, 1 or more.",
        ...ephemeral,
      }));
    const result = await payMember(ctx.db, {
      guildId: interaction.guildId,
      from: { id: interaction.user.id, name: interaction.user.username },
      to: { id: to.id, name: to.username },
      amount,
      dailyCap: config.earn.pay.dailyCap,
    });
    if (!result.ok)
      return void (await interaction.reply({
        content:
          result.reason === "cap"
            ? `You can pay ${money(config.currency, result.left)} more today.`
            : `You have ${money(config.currency, result.balance)}.`,
        ...ephemeral,
      }));
    await interaction.reply({
      content: `${interaction.user} paid ${to} ${money(config.currency, amount)}.`,
      allowedMentions: { users: [to.id] },
    });
  },
};

export const shop: Command = {
  data: guildCommand("shop", "See what the server's shop sells.", null).toJSON(),
  async execute(interaction, ctx) {
    const config = await economyOf(ctx, interaction.guildId);
    if (!config.enabled) return void (await interaction.reply({ content: OFF, ...ephemeral }));
    const limit = entitlements(await getGuildPlan(ctx.db, interaction.guildId))["economy.items"];
    const items = config.shop.slice(0, limit);
    if (!items.length)
      return void (await interaction.reply({
        content: "The shop is empty for now.",
        ...ephemeral,
      }));
    const lines = items.map((i) => {
      const what =
        i.kind === "role"
          ? `<@&${i.roleId}>${i.hours ? ` for ${i.hours} hours` : ""}`
          : "handed over by staff";
      const note = i.description ? `\n-# ${safeText(i.description)}` : "";
      return `${i.emoji ? `${i.emoji} ` : ""}**${safeText(i.name)}** · ${money(config.currency, i.price)} · ${what}${note}`;
    });
    await interaction.reply(
      cardReply({
        title: "Shop",
        lead: "Buy with /buy",
        blocks: [{ text: lines.join("\n") }],
        module: "treasury",
      }),
    );
  },
};

export const buyCommand: Command = {
  data: guildCommand("buy", "Buy something from the shop.", null)
    .addStringOption((o) =>
      o.setName("item").setDescription("What to buy").setRequired(true).setAutocomplete(true),
    )
    .toJSON(),
  async autocomplete(interaction, ctx) {
    const config = await economyOf(ctx, interaction.guildId);
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      config.shop
        .filter((i) => i.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((i) => ({ name: `${i.name} · ${coinNumber(i.price)}`.slice(0, 100), value: i.id })),
    );
  },
  async execute(interaction, ctx) {
    if (tooFast(interaction.user.id)) return void (await interaction.reply(SLOW));
    const config = await economyOf(ctx, interaction.guildId);
    const asked = interaction.options.getString("item", true);
    // A name typed without picking from the list works too.
    const item =
      config.shop.find((i) => i.id === asked) ??
      config.shop.find((i) => i.name.toLowerCase() === asked.toLowerCase());
    // An item that asks something opens its form; submitting it buys it (shopForms).
    if (config.enabled && item?.question) {
      await interaction.showModal(shopForm(item));
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await buy(ctx, interaction.guild, interaction.member, item?.id ?? asked);
    await interaction.editReply(result.message);
  },
};

export const moneyCommand: Command = {
  data: guildCommand("money", "Give or take coins, with a reason.", PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Give a member coins")
        .addUserOption((o) => o.setName("member").setDescription("Who").setRequired(true))
        .addStringOption((o) =>
          o.setName("amount").setDescription("How much").setRequired(true).setMaxLength(13),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Why")
            .setRequired(true)
            .setMaxLength(ECONOMY_LIMITS.reason),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("take")
        .setDescription("Take coins from a member")
        .addUserOption((o) => o.setName("member").setDescription("Who").setRequired(true))
        .addStringOption((o) =>
          o.setName("amount").setDescription("How much").setRequired(true).setMaxLength(13),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Why")
            .setRequired(true)
            .setMaxLength(ECONOMY_LIMITS.reason),
        ),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("member", true);
    const amount = parseAmount(interaction.options.getString("amount", true));
    if (!amount || user.bot)
      return void (await interaction.reply({
        content: "A whole amount, to a member (not a bot).",
        ...ephemeral,
      }));
    const sign = interaction.options.getSubcommand() === "take" ? -1 : 1;
    const result = await staffAdjust(
      ctx,
      interaction.guild,
      {
        userId: user.id,
        amount: sign * amount,
        reason: interaction.options.getString("reason", true),
      },
      { id: interaction.user.id, name: interaction.user.username },
    );
    await interaction.reply({ content: result.message, ...ephemeral });
  },
};

/** The richest ten, for /leaderboard's money board. */
export async function moneyBoard(ctx: BotContext, guildId: string) {
  const config = await economyOf(ctx, guildId);
  if (!config.enabled) return null;
  const top = await topWallets(ctx.db, guildId, 10);
  return {
    config,
    lines: top.map((w, i) => `${i + 1}. <@${w.userId}> · **${money(config.currency, w.balance)}**`),
  };
}

/** Done and Refund on a staff purchase card: Manage Server or Manage Roles. */
export const purchaseButtons: ButtonHandler = {
  prefix: "eco",
  async execute(interaction, ctx) {
    const [, choice, id] = interaction.customId.split(":");
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
    )
      return void (await interaction.reply({
        content: "Only staff (Manage Server or Manage Roles) can decide on purchases.",
        ...ephemeral,
      }));
    await interaction.deferReply(ephemeral);
    const result = await decidePurchase(ctx, interaction.guild, id ?? "", choice === "done", {
      id: interaction.user.id,
      name: interaction.user.username,
    });
    await interaction.editReply(result.message);
  },
};

export const economyCommands: Command[] = [balance, daily, pay, shop, buyCommand, moneyCommand];
