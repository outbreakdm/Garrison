import { listCasesForTarget } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { formatDuration } from "../../../lib/duration.js";
import { brandEmbed } from "../../../lib/embeds.js";
import { safeText } from "../../../lib/text.js";
import { actionNoun, NO_REASON } from "../copy.js";
import { ephemeral, watchCommand } from "./shared.js";

const LIMIT = 10;

export const history: Command = {
  data: watchCommand(
    "history",
    "Show a member's recent moderation cases.",
    PermissionFlagsBits.ModerateMembers,
  )
    .addUserOption((o) => o.setName("user").setDescription("Member to look up").setRequired(true))
    .toJSON(),
  async execute(interaction, ctx) {
    const user = interaction.options.getUser("user", true);
    const cases = await listCasesForTarget(ctx.db, interaction.guild.id, user.id, LIMIT);
    if (!cases.length) {
      await interaction.reply({
        content: `<@${user.id}> has no cases. Clean record.`,
        ...ephemeral,
      });
      return;
    }
    const lines = cases.map((c) => {
      const parts = [
        `\`#${c.caseNumber}\``,
        actionNoun(c.action),
        c.durationSeconds ? formatDuration(c.durationSeconds) : null,
        c.reason ? safeText(c.reason) : NO_REASON,
        `<t:${Math.floor(c.createdAt.getTime() / 1000)}:R>`,
      ].filter(Boolean);
      const line = parts.join(" · ");
      return c.revokedAt ? `~~${line}~~ (undone)` : line;
    });
    await interaction.reply({
      embeds: [
        brandEmbed({
          tone: "intel",
          title: `History for ${user.username}`,
          description: lines.join("\n"),
          module: "watch",
          ref: cases.length === LIMIT ? `latest ${LIMIT}` : `${cases.length} cases`,
        }),
      ],
      ...ephemeral,
    });
  },
};
