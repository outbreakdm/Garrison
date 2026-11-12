import { addMemberNote, listMemberNotes, NOTE_MAX } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { cardReply, ts } from "../../../lib/card.js";
import { ensureGuild } from "../../../lib/guild-registry.js";
import { safeText } from "../../../lib/text.js";
import { watchCommand } from "./shared.js";

/** /note: staff notes on a member. Private: the member never sees them, and replies are ephemeral. */
export const note: Command = {
  data: watchCommand(
    "note",
    "Keep private staff notes on a member.",
    PermissionFlagsBits.ModerateMembers,
  )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a note")
        .addUserOption((o) => o.setName("user").setDescription("Who it's about").setRequired(true))
        .addStringOption((o) =>
          o.setName("text").setDescription("The note").setRequired(true).setMaxLength(NOTE_MAX),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("Read a member's notes")
        .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true)),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    const user = interaction.options.getUser("user", true);
    if (interaction.options.getSubcommand() === "add") {
      await addMemberNote(ctx.db, {
        guildId: interaction.guild.id,
        userId: user.id,
        authorId: interaction.user.id,
        authorName: interaction.member.displayName,
        body: interaction.options.getString("text", true),
      });
      await interaction.reply(
        cardReply({
          tone: "go",
          title: "Note added",
          blocks: [{ text: `On <@${user.id}>. Only staff see it, here and on the dashboard.` }],
          module: "watch",
        }),
      );
      return;
    }
    const notes = await listMemberNotes(ctx.db, interaction.guild.id, user.id, 10);
    await interaction.reply(
      cardReply({
        title: `Notes on ${safeText(user.username)}`,
        blocks: notes.length
          ? notes.map((n) => ({
              text: `${safeText(n.body)}\n-# ${safeText(n.authorName)} · ${ts(n.createdAt)}`,
            }))
          : [{ text: "No notes yet." }],
        module: "watch",
      }),
    );
  },
};
