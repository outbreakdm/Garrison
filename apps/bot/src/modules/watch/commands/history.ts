import { listCasesForTarget } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import type { Command } from "../../../commands/types.js";
import { cardReply, ts } from "../../../lib/card.js";
import { formatDuration } from "../../../lib/duration.js";
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
    // One case per line: the action leads, then the reason, then when. Undone cases are struck through.
    const lines = cases.map((c) => {
      const what = [
        actionNoun(c.action),
        c.durationSeconds ? formatDuration(c.durationSeconds) : null,
      ]
        .filter(Boolean)
        .join(" ");
      const line = `\`#${c.caseNumber}\` **${what}** · ${c.reason ? safeText(c.reason) : NO_REASON} · ${ts(c.createdAt)}`;
      return c.revokedAt ? `~~${line}~~ undone` : line;
    });
    const active = cases.filter((c) => !c.revokedAt).length;
    await interaction.reply(
      cardReply({
        tone: "intel",
        title: `History for ${safeText(user.username)}`,
        lead: `${active} active of ${cases.length} ${cases.length === 1 ? "case" : "cases"}`,
        blocks: [{ text: lines.join("\n") }],
        module: "watch",
        ref: cases.length === LIMIT ? `latest ${LIMIT}` : undefined,
      }),
    );
  },
};
