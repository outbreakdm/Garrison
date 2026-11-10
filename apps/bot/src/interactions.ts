import { type Interaction, MessageFlags } from "discord.js";
import { buttons, commandsByName, modals } from "./commands/index.js";
import type { BotContext } from "./commands/types.js";
import { failed } from "./lib/embeds.js";

const FAILURE = "Something went wrong on my side. Try again in a moment.";

export async function handleInteraction(interaction: Interaction, ctx: BotContext) {
  if (interaction.isAutocomplete()) {
    if (!interaction.inCachedGuild()) return;
    const command = commandsByName.get(interaction.commandName);
    // Suggestions are best effort: an error just means no suggestions.
    await command
      ?.autocomplete?.(interaction, ctx)
      .catch((error: unknown) =>
        ctx.logger.debug("Autocomplete failed", { command: interaction.commandName, error }),
      );
    return;
  }
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit())
    return;

  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        ...failed("Garrison commands work inside a server."),
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // Response time: from Discord's creation timestamp to Garrison's first reply.
  if (ctx.metrics) instrumentFirstResponse(interaction, ctx);

  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, ctx);
      return;
    }
    if (interaction.isModalSubmit()) {
      const modal = modals.find((m) => interaction.customId.startsWith(`${m.prefix}:`));
      if (modal) await modal.execute(interaction, ctx);
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
        await interaction.followUp({ ...failed(FAILURE), flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ ...failed(FAILURE), flags: MessageFlags.Ephemeral });
      }
    } catch {
      // The interaction token may have expired; nothing more we can do.
    }
  }
}

const FIRST_RESPONSE = ["reply", "deferReply", "update", "deferUpdate", "showModal"] as const;

function instrumentFirstResponse(interaction: Interaction, ctx: BotContext) {
  let recorded = false;
  const target = interaction as unknown as Record<string, unknown>;
  for (const name of FIRST_RESPONSE) {
    const original = target[name];
    if (typeof original !== "function") continue;
    target[name] = async (...args: unknown[]) => {
      const result = await (original as (...a: unknown[]) => Promise<unknown>).apply(
        interaction,
        args,
      );
      if (!recorded) {
        recorded = true;
        ctx.metrics?.response(interaction.guildId, Date.now() - interaction.createdTimestamp);
      }
      return result;
    };
  }
}
