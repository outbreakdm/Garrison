import {
  ECONOMY_LIMITS,
  type EconomyConfig,
  entitlements,
  getGuildPlan,
  getShopPanel,
  getWallet,
  money,
  SHOP_PANEL,
  SHOP_PANEL_ITEMS,
  type ShopItem,
  type ShopPanelConfig,
  setShopPanelMessage,
  shopPanelWords,
  shopSold,
} from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { type Card, cardMessage } from "../../lib/card.js";
import { placePanel } from "../../lib/panels.js";
import { safeText } from "../../lib/text.js";
import { economyOf, OFF } from "./service.js";

/**
 * The shop panel: the server's shop as a card with a "Buy something…" dropdown. Picking an item
 * shows its price and the member's balance with a Buy button (nothing is spent until they
 * press it), or opens the item's question when it asks one. Garrison updates the panel in place
 * after each purchase or refund, so the stock it shows stays right.
 */

export const SHOP_PICK_PREFIX = "shoppick";
export const SHOP_BUY_PREFIX = "shopbuy";
export const SHOP_FORM_PREFIX = "shopform";

/** What one item gives, in a few words. */
const gives = (i: ShopItem) =>
  i.kind === "role"
    ? `<@&${i.roleId}>${i.hours ? ` for ${i.hours} hours` : ""}`
    : "handed over by staff";

/** The panel: the server's words, each item with its price (and what's left), and the dropdown. */
export function shopPanelMessage(
  config: EconomyConfig,
  panel: Pick<ShopPanelConfig, "shopPanelTitle" | "shopPanelBody">,
  items: ShopItem[],
  sold: Map<string, number>,
) {
  const words = shopPanelWords(panel);
  const left = (i: ShopItem) =>
    i.stock === null ? null : Math.max(0, i.stock - (sold.get(i.id) ?? 0));
  const lines = items.map((i) => {
    const n = left(i);
    const stock = n === null ? "" : n ? ` · ${n} left` : " · sold out";
    const note = i.description ? `\n-# ${safeText(i.description)}` : "";
    return `${i.emoji ? `${i.emoji} ` : ""}**${safeText(i.name)}** · ${money(config.currency, i.price)} · ${gives(i)}${stock}${note}`;
  });
  const forSale = items.filter((i) => left(i) !== 0).slice(0, SHOP_PANEL_ITEMS);
  const card: Card = {
    tone: "volt",
    title: words.title,
    blocks: [
      ...(words.body ? [{ text: words.body }] : []),
      ...(lines.length ? [{ text: lines.join("\n") }] : [{ text: "The shop is empty for now." }]),
    ],
    module: "treasury",
  };
  if (forSale.length)
    card.menu = new StringSelectMenuBuilder()
      .setCustomId(`${SHOP_PICK_PREFIX}:pick`)
      .setPlaceholder(SHOP_PANEL.pick)
      .addOptions(
        forSale.map((i) => ({
          label: i.name.slice(0, 100),
          value: i.id,
          description:
            `${money(config.currency, i.price)}${i.question ? " · asks you something" : ""}`.slice(
              0,
              100,
            ),
          ...(i.emoji ? { emoji: i.emoji } : {}),
        })),
      );
  return cardMessage(card);
}

/** The item's question, as Discord's form; submitting it buys the item. */
export function shopForm(item: ShopItem) {
  return new ModalBuilder()
    .setCustomId(`${SHOP_FORM_PREFIX}:${item.id}`)
    .setTitle(`Buy ${item.name}`.slice(0, 45))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(item.question ?? "Anything staff should know?")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("answer")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(ECONOMY_LIMITS.answer)
            .setRequired(true),
        ),
    );
}

/** Before anything is spent: the price, the balance, and Buy or Cancel. */
export async function shopConfirm(
  ctx: BotContext,
  guildId: string,
  userId: string,
  config: EconomyConfig,
  item: ShopItem,
): Promise<Card> {
  const wallet = await getWallet(ctx.db, guildId, userId);
  const short = wallet.balance < item.price;
  return {
    tone: short ? "caution" : "volt",
    title: `Buy ${item.name}?`,
    lead: `${money(config.currency, item.price)} · you have ${money(config.currency, wallet.balance)}`,
    blocks: [
      {
        text: short
          ? "You don't have enough yet."
          : item.kind === "role"
            ? `You get ${gives(item)} right away.`
            : "Staff hand it over; you'll see it in your purchases.",
      },
    ],
    actions: short
      ? []
      : [
          new ButtonBuilder()
            .setCustomId(`${SHOP_BUY_PREFIX}:yes:${item.id}`)
            .setLabel(`Buy for ${money(config.currency, item.price)}`.slice(0, 80))
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${SHOP_BUY_PREFIX}:no`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary),
        ],
    module: "treasury",
  };
}

/** The items this server's plan sells (the rest pause on Free), in the shop's order. */
export async function itemsForSale(ctx: BotContext, guildId: string, config: EconomyConfig) {
  const ent = entitlements(await getGuildPlan(ctx.db, guildId));
  return config.shop.slice(0, ent["economy.items"]);
}

/**
 * After a purchase or a refund: update the posted panel in place, so its stock is right. Never
 * fails the purchase: a panel that can't be edited stays as it was.
 */
export async function refreshShopPanel(ctx: BotContext, guild: Guild) {
  try {
    const panel = await getShopPanel(ctx.db, guild.id);
    if (!panel.shopPanelChannelId || !panel.shopPanelMessageId) return;
    const channel = guild.channels.cache.get(panel.shopPanelChannelId);
    if (!channel?.isTextBased()) return;
    const config = await economyOf(ctx, guild.id);
    const [items, sold] = await Promise.all([
      itemsForSale(ctx, guild.id, config),
      shopSold(ctx.db, guild.id),
    ]);
    await channel.messages.edit(
      panel.shopPanelMessageId,
      shopPanelMessage(config, panel, items, sold),
    );
  } catch (error) {
    ctx.logger.warn("Could not update the shop panel", { guildId: guild.id, error });
  }
}

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });
const postPanel = z.object({ channelId: z.string().regex(/^\d{17,20}$/) });

/**
 * Dashboard (or the AI assistant) request: post the shop panel. One per server: posting again
 * moves it. The same channel checks as posting any panel.
 */
export async function doPostShopPanel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = postPanel.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const config = await economyOf(ctx, guild.id);
  if (!config.enabled) return fail(OFF);
  if (!config.shop.length) return fail("Add something to the shop first.");
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");
  const [panel, items, sold] = await Promise.all([
    getShopPanel(ctx.db, guild.id),
    itemsForSale(ctx, guild.id, config),
    shopSold(ctx.db, guild.id),
  ]);
  const at = await placePanel(guild, channel, shopPanelMessage(config, panel, items, sold), {
    channelId: panel.shopPanelChannelId ?? undefined,
    messageId: panel.shopPanelMessageId ?? undefined,
  });
  await setShopPanelMessage(ctx.db, guild.id, at);
  return { ok: true, message: `Posted the shop panel in #${channel.name}.` };
}
