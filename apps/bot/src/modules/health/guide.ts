import { ButtonBuilder, ButtonStyle, type Message, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { cardMessage, cardReply, isLegacy, notice } from "../../lib/card.js";
import { HELLO_TITLE, helloCard } from "../../lib/hello.js";

/** Garrison's own welcome message, new or from before the starting guide. */
export function isHello(message: Pick<Message, "components" | "embeds">) {
  const parts = JSON.stringify(message.components.map((c) => c.toJSON()));
  return parts.includes(HELLO_TITLE) || message.embeds.some((e) => e.title === HELLO_TITLE);
}

/**
 * /guide: the starting guide Garrison posts when it joins, on demand. Run where Garrison
 * already said hello, it turns that message into the current guide in place, so a server
 * that added Garrison before the guide gets it without a second welcome. Anywhere else it
 * posts a fresh one.
 */
export const guide: Command = {
  data: guildCommand(
    "guide",
    "Post Garrison's starting guide here, or refresh the old one.",
    PermissionFlagsBits.ManageGuild,
  ).toJSON(),
  async execute(interaction, ctx) {
    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply(
        notice("Garrison can't post in this channel. Check its permissions here.", "alert"),
      );
      return;
    }
    await interaction.deferReply(ephemeral);
    const message = cardMessage(helloCard(interaction.guildId, ctx.appUrl));
    // Without Read Message History the search fails; then a fresh guide is posted instead.
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const old = recent?.find(
      (m) => m.author.id === interaction.client.user.id && isHello(m) && !isLegacy(m),
    );
    const posted = old
      ? await old.edit(message).catch(() => null)
      : await channel.send(message).catch(() => null);
    if (!posted) {
      await interaction.editReply(
        notice("Garrison couldn't post the guide here. Check its permissions.", "alert"),
      );
      return;
    }
    await interaction.editReply(
      cardReply({
        tone: "go",
        title: old ? "Starting guide updated" : "Starting guide posted",
        blocks: [
          {
            text: old
              ? "Garrison's earlier welcome message in this channel now shows the current guide."
              : "Garrison's starting guide is posted in this channel.",
          },
        ],
        actions: [
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View guide").setURL(posted.url),
        ],
      }),
    );
  },
};
