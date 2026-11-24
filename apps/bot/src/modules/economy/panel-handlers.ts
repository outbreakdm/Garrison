import { ephemeral } from "../../commands/builders.js";
import type { ButtonHandler, ModalHandler, SelectHandler } from "../../commands/types.js";
import { cardEdit, cardReply } from "../../lib/card.js";
import {
  itemsForSale,
  SHOP_BUY_PREFIX,
  SHOP_FORM_PREFIX,
  SHOP_PICK_PREFIX,
  shopConfirm,
  shopForm,
} from "./panel.js";
import { buy, economyOf, OFF } from "./service.js";

/**
 * The shop panel's dropdown, its Buy and Cancel, and the form an item with a question opens.
 * Every purchase goes through buy(), the same as /buy and the member page.
 */

/** Picked from the dropdown: its question, or the price and balance with Buy and Cancel. */
export const shopPickSelects: SelectHandler = {
  prefix: SHOP_PICK_PREFIX,
  async execute(interaction, ctx) {
    const config = await economyOf(ctx, interaction.guildId);
    if (!config.enabled) {
      await interaction.reply({ content: OFF, ...ephemeral });
      return;
    }
    const items = await itemsForSale(ctx, interaction.guildId, config);
    const item = items.find((i) => i.id === interaction.values[0]);
    if (!item) {
      await interaction.reply({ content: "That item isn't in the shop anymore.", ...ephemeral });
      return;
    }
    if (item.question) {
      await interaction.showModal(shopForm(item));
      return;
    }
    await interaction.reply(
      cardReply(await shopConfirm(ctx, interaction.guildId, interaction.user.id, config, item)),
    );
  },
};

/** Buy or Cancel on the private confirmation. */
export const shopBuyButtons: ButtonHandler = {
  prefix: SHOP_BUY_PREFIX,
  async execute(interaction, ctx) {
    const [, choice, itemId] = interaction.customId.split(":");
    if (choice !== "yes" || !itemId) {
      await interaction.update(
        cardEdit(interaction.message, { title: "Nothing bought", module: "treasury" }),
      );
      return;
    }
    await interaction.deferUpdate();
    const result = await buy(ctx, interaction.guild, interaction.member, itemId);
    await interaction.editReply(
      cardEdit(interaction.message, {
        tone: result.ok ? "go" : "caution",
        title: result.ok ? "Bought" : "Not bought",
        blocks: [{ text: result.message }],
        module: "treasury",
      }),
    );
  },
};

/** The item's question came back: buy it with the answer for staff. */
export const shopForms: ModalHandler = {
  prefix: SHOP_FORM_PREFIX,
  async execute(interaction, ctx) {
    const itemId = interaction.customId.split(":")[1] ?? "";
    let answer = "";
    try {
      answer = interaction.fields.getTextInputValue("answer");
    } catch {}
    await interaction.deferReply(ephemeral);
    const result = await buy(ctx, interaction.guild, interaction.member, itemId, answer);
    await interaction.editReply(result.message);
  },
};
