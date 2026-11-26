import { getGatehouseSettings, updateGatehouseSettings, waitingVerifyAnswers } from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { ephemeral, guildCommand } from "../../../commands/builders.js";
import type { ButtonHandler, Command } from "../../../commands/types.js";
import { notice } from "../../../lib/card.js";
import { ensureGuild } from "../../../lib/guild-registry.js";
import { VERIFY_BUTTON_ID, verifyPanel } from "../embeds.js";
import { questionsForm, questionsOf } from "../questions.js";
import { invalidateGatehouseSettings, verifyMember, verifyReady } from "../service.js";

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
      await interaction.reply(
        notice("Verification is off. Delete the old Verify message when you're ready.", "go"),
      );
      return;
    }

    const role = interaction.options.getRole("role", true);
    const channel = interaction.options.getChannel("channel", true, [ChannelType.GuildText]);
    const minAge = interaction.options.getInteger("min_account_age_days") ?? 0;
    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

    if (role.managed || role.id === interaction.guild.roles.everyone.id) {
      await interaction.reply(
        notice(
          `<@&${role.id}> is managed by Discord or an integration. Pick a normal role.`,
          "alert",
        ),
      );
      return;
    }
    if (
      !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
      role.position >= me.roles.highest.position
    ) {
      await interaction.reply(
        notice(
          `I can't give <@&${role.id}>: my role sits below it. Drag Garrison above it in Server Settings → Roles.`,
          "alert",
        ),
      );
      return;
    }
    if (
      !channel
        .permissionsFor(me)
        ?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
    ) {
      await interaction.reply(
        notice(
          `I can't post in <#${channel.id}>. Give Garrison Send Messages and Embed Links there.`,
          "alert",
        ),
      );
      return;
    }

    await updateGatehouseSettings(ctx.db, interaction.guild.id, {
      verifyRoleId: role.id,
      verifyMinAccountAgeDays: minAge,
    });
    invalidateGatehouseSettings(interaction.guild.id);
    const settings = await getGatehouseSettings(ctx.db, interaction.guild.id);
    await channel.send(verifyPanel(settings));
    await interaction.reply(
      notice(`Saved. The Verify button is up in <#${channel.id}> and gives <@&${role.id}>.`, "go"),
    );
  },
};

export const verifyButton: ButtonHandler = {
  prefix: VERIFY_BUTTON_ID,
  async execute(interaction, ctx) {
    const settings = await getGatehouseSettings(ctx.db, interaction.guildId);
    // Website verification: a link to the page, where a captcha may run first.
    if (settings.verifyWeb && settings.verifyRoleId && ctx.appUrl) {
      await interaction.reply({
        content: "Verify on Garrison's website: sign in with Discord and you're in.",
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel("Verify on the website")
              .setURL(`${ctx.appUrl}/verify/${interaction.guildId}`),
          ),
        ],
        ...ephemeral,
      });
      return;
    }
    // Questions first: checked before the form opens, so nobody answers for nothing.
    const questions = questionsOf(settings);
    if (questions.length) {
      const ready = await verifyReady(ctx, interaction.member);
      if (!ready.ok) {
        await interaction.reply(notice(ready.message, "intel"));
        return;
      }
      if (await waitingVerifyAnswers(ctx.db, interaction.guildId, interaction.user.id)) {
        await interaction.reply(
          notice("Your answers are with the staff. You'll get the role once they approve.", "go"),
        );
        return;
      }
      await interaction.showModal(
        questionsForm(interaction.guildId, questions, settings.verifyIntro),
      );
      return;
    }
    await interaction.deferReply(ephemeral);
    await interaction.editReply(await verifyMember(ctx, interaction.member));
  },
};
