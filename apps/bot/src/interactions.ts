import { brand, inviteUrl } from "@garrison/brand";
import { type Interaction, MessageFlags } from "discord.js";
import { buttons, commandsByName, modals, selects } from "./commands/index.js";
import type { BotContext } from "./commands/types.js";
import { notice } from "./lib/card.js";
import { onModmailPick } from "./modules/tickets/modmail.js";

// Angle brackets stop Discord unfurling the invite into a large card.
const FAILURE = `Something went wrong on my side. Try again in a moment.\n-# Keeps happening? Tell us in the support server: <${brand.supportUrl}>`;

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
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isButton() &&
    !interaction.isStringSelectMenu() &&
    !interaction.isModalSubmit()
  )
    return;

  // Modmail's server picker is the one button that lives in DMs.
  if (interaction.isButton() && interaction.customId.startsWith("mm:")) {
    await onModmailPick(ctx, interaction).catch((error: unknown) =>
      ctx.logger.error("Modmail failed", { error }),
    );
    return;
  }

  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) {
      // In a server Garrison isn't in (the app was added to someone's account, not the server),
      // say how to add it; in DMs, that commands work in a server.
      const content = interaction.guildId
        ? `Garrison isn't in this server yet, so its commands can't work here. Someone with Manage Server can add it: <${inviteUrl(interaction.applicationId, interaction.guildId)}>`
        : "Garrison commands work inside a server.";
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
    if (interaction.isStringSelectMenu()) {
      const select = selects.find((s) => interaction.customId.startsWith(`${s.prefix}:`));
      if (select) await select.execute(interaction, ctx);
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
        await interaction.followUp(notice(FAILURE, "alert"));
      } else {
        await interaction.reply(notice(FAILURE, "alert"));
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
