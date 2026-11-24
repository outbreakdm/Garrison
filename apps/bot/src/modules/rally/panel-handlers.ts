import { findOpenLfgByHost, getLfgPanel, LFG_PANEL } from "@garrison/db";
import { ephemeral } from "../../commands/builders.js";
import type { ButtonHandler, ModalHandler } from "../../commands/types.js";
import { doCreateLfg } from "../dashboard/more.js";
import { safeText } from "./card.js";
import { LFG_FORM_PREFIX, LFG_OTHER, LFG_PANEL_PREFIX, lfgForm } from "./panel.js";
import { cachedTemplates } from "./templates.js";

/**
 * The LFG panel's buttons and forms. Kept apart from panel.ts: the form posts through the
 * dashboard's own group creation (doCreateLfg), which moves the panel with panel.ts.
 */

/** A panel button: open its form, or say privately why not. */
export const lfgPanelButtons: ButtonHandler = {
  prefix: LFG_PANEL_PREFIX,
  async execute(interaction, ctx) {
    const [, kind, id] = interaction.customId.split(":");
    const [{ templates }, config, open] = await Promise.all([
      cachedTemplates(ctx, interaction.guildId),
      getLfgPanel(ctx.db, interaction.guildId),
      findOpenLfgByHost(ctx.db, interaction.guildId, interaction.user.id),
    ]);
    const template = kind === "t" ? (templates.find((t) => t.id === id) ?? null) : null;
    const why =
      kind === "t" && !template
        ? "That template was removed. Ask staff to post the panel again."
        : kind === LFG_OTHER && !config.lfgPanelOther
          ? `The "${LFG_PANEL.other}" button is off here. Pick a template, or use /lfg create.`
          : template?.channelIds.length && !template.channelIds.includes(interaction.channelId)
            ? `${safeText(template.name)} groups go in ${template.channelIds.map((c) => `<#${c}>`).join(", ")}.`
            : open
              ? "You already have an open group. Close it with `/lfg close` first."
              : null;
    if (why) {
      await interaction.reply({ content: why, ...ephemeral });
      return;
    }
    await interaction.showModal(lfgForm(template));
  },
};

/** The form came back: post the group in the panel's channel and answer privately. */
export const lfgPanelModals: ModalHandler = {
  prefix: LFG_FORM_PREFIX,
  async execute(interaction, ctx) {
    const [, kind, id] = interaction.customId.split(":");
    const text = (key: string) => {
      try {
        return interaction.fields.getTextInputValue(key).trim() || null;
      } catch {
        return null;
      }
    };
    let myRole: string | null = null;
    try {
      myRole = interaction.fields.getStringSelectValues("role")[0] ?? null;
    } catch {}
    // "How many players?": a number is the size, anything else the roles.
    const slots = text("slots");
    const size = slots && /^\d+$/.test(slots) ? Number(slots) : null;
    if (size !== null && (size < 2 || size > 40)) {
      await interaction.reply({ content: "Groups are 2 to 40 players.", ...ephemeral });
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await doCreateLfg(
      ctx,
      interaction.guild,
      interaction.member,
      {
        channelId: interaction.channelId,
        title: text("title") ?? "",
        templateId: kind === "t" ? (id ?? null) : null,
        roles: slots && size === null ? slots : null,
        size,
        myRole,
        starts: text("starts"),
        note: text("note"),
      },
      { fromPanel: true },
    );
    await interaction.editReply(result.message);
  },
};
