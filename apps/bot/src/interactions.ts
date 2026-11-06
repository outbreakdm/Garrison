import { type Interaction, MessageFlags } from "discord.js";
import { buttons, commandsByName } from "./commands/index.js";
import type { BotContext } from "./commands/types.js";

const FAILURE = "Something went wrong on my side. Try again in a moment.";

export async function handleInteraction(interaction: Interaction, ctx: BotContext) {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "Garrison commands work inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, ctx);
      return;
    }
    const handler = buttons.find((b) => interaction.customId.startsWith(`${b.prefix}:`));
    if (handler) await handler.execute(interaction, ctx);
  } catch (error) {
    ctx.logger.error("Interaction failed", {
      guildId: interaction.guildId,
      kind: interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.customId,
      error,
    });
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: FAILURE, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: FAILURE, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // The interaction token may have expired; nothing more we can do.
    }
  }
}
