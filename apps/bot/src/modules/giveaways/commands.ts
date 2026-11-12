import { GIVEAWAY_DURATIONS, listGiveaways } from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { cardReply } from "../../lib/card.js";
import { doGiveawayAction, doStartGiveaway } from "./service.js";

/**
 * /giveaway: start, draw or redraw one from Discord. The same checks as the
 * dashboard: entry rules, bonus entries and repeating are set on the dashboard.
 */
export const giveaway: Command = {
  data: guildCommand("giveaway", "Run giveaways.", PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a giveaway with an Enter button")
        .addStringOption((o) =>
          o.setName("prize").setDescription("What they win").setRequired(true).setMaxLength(100),
        )
        .addIntegerOption((o) =>
          o
            .setName("length")
            .setDescription("How long it runs")
            .setRequired(true)
            .addChoices(...GIVEAWAY_DURATIONS.map((d) => ({ name: d.label, value: d.minutes }))),
        )
        .addIntegerOption((o) =>
          o
            .setName("winners")
            .setDescription("How many win (default 1)")
            .setMinValue(1)
            .setMaxValue(20),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where to post it (default: here)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("end")
        .setDescription("Draw the winners now")
        .addStringOption((o) =>
          o.setName("giveaway").setDescription("Which one").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reroll")
        .setDescription("Draw new winners for a finished giveaway")
        .addStringOption((o) =>
          o.setName("giveaway").setDescription("Which one").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("cancel")
        .setDescription("Cancel a running giveaway without drawing")
        .addStringOption((o) =>
          o.setName("giveaway").setDescription("Which one").setRequired(true).setAutocomplete(true),
        ),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply(ephemeral);
    const outcome =
      sub === "start"
        ? await doStartGiveaway(ctx, interaction.guild, interaction.member, {
            channelId: (interaction.options.getChannel("channel") ?? interaction.channel)?.id,
            prize: interaction.options.getString("prize", true),
            description: null,
            winners: interaction.options.getInteger("winners") ?? 1,
            durationMinutes: interaction.options.getInteger("length", true),
            bonusRoles: [],
          })
        : await doGiveawayAction(ctx, interaction.guild, {
            giveawayId: interaction.options.getString("giveaway", true),
            op: sub === "reroll" ? "reroll" : sub === "cancel" ? "cancel" : "end",
          });
    await interaction.editReply(
      cardReply({
        tone: outcome.ok ? "go" : "caution",
        title: outcome.ok ? "Done" : "Not done",
        blocks: [{ text: outcome.message }],
        module: "spoils",
      }),
    );
  },
  async autocomplete(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const want = sub === "reroll" ? "ended" : "running";
    const q = interaction.options.getFocused().toLowerCase();
    const list = await listGiveaways(ctx.db, interaction.guildId, 50);
    await interaction.respond(
      list
        .filter((g) => g.status === want && g.prize.toLowerCase().includes(q))
        .slice(0, 25)
        .map((g) => ({ name: g.prize.slice(0, 100), value: g.id })),
    );
  },
};
