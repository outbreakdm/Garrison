import { getGatehouseSettings, updateGatehouseSettings } from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../../commands/builders.js";
import type { ButtonHandler, Command } from "../../../commands/types.js";
import { ensureGuild } from "../../watch/service.js";
import { VERIFY_BUTTON_ID, verifyPanel } from "../embeds.js";
import { invalidateGatehouseSettings, verifyMember } from "../service.js";

export const verify: Command = {
  data: guildCommand(
    "verify",
    "Set up the verification button that lets new members in.",
    PermissionFlagsBits.ManageGuild,
  )
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Post a Verify button that gives a role")
        .addRoleOption((o) =>
          o.setName("role").setDescription("Role verified members get").setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where to post the button")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("min_account_age_days")
            .setDescription("Turn away accounts younger than this (default: 0)")
            .setMinValue(0)
            .setMaxValue(365),
        ),
    )
    .addSubcommand((s) =>
      s.setName("off").setDescription("Turn verification off. Existing buttons stop working"),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    if (interaction.options.getSubcommand() === "off") {
      await updateGatehouseSettings(ctx.db, interaction.guild.id, { verifyRoleId: null });
      invalidateGatehouseSettings(interaction.guild.id);
      await interaction.reply({
        content: "Verification is off. Delete the old Verify message when you're ready.",
        ...ephemeral,
      });
      return;
    }

    const role = interaction.options.getRole("role", true);
    const channel = interaction.options.getChannel("channel", true, [ChannelType.GuildText]);
    const minAge = interaction.options.getInteger("min_account_age_days") ?? 0;
    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

    if (role.managed || role.id === interaction.guild.roles.everyone.id) {
      await interaction.reply({
        content: `<@&${role.id}> is managed by Discord or an integration. Pick a normal role.`,
        ...ephemeral,
      });
      return;
    }
    if (
      !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
      role.position >= me.roles.highest.position
    ) {
      await interaction.reply({
        content: `I can't give <@&${role.id}>: my role sits below it. Drag Garrison above it in Server Settings → Roles.`,
        ...ephemeral,
      });
      return;
    }
    if (
      !channel
        .permissionsFor(me)
        ?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
    ) {
      await interaction.reply({
        content: `I can't post in <#${channel.id}>. Give Garrison Send Messages and Embed Links there.`,
        ...ephemeral,
      });
      return;
    }

    await updateGatehouseSettings(ctx.db, interaction.guild.id, {
      verifyRoleId: role.id,
      verifyMinAccountAgeDays: minAge,
    });
    invalidateGatehouseSettings(interaction.guild.id);
    const settings = await getGatehouseSettings(ctx.db, interaction.guild.id);
    await channel.send(verifyPanel(settings));
    await interaction.reply({
      content: `Saved. The Verify button is up in <#${channel.id}> and gives <@&${role.id}>.`,
      ...ephemeral,
    });
  },
};

export const verifyButton: ButtonHandler = {
  prefix: VERIFY_BUTTON_ID,
  async execute(interaction, ctx) {
    await interaction.deferReply(ephemeral);
    await interaction.editReply(await verifyMember(ctx, interaction.member));
  },
};
