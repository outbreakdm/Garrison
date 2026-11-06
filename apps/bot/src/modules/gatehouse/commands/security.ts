import {
  type GatehouseSettingsPatch,
  getGatehouseSettings,
  updateGatehouseSettings,
} from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../../commands/builders.js";
import type { Command } from "../../../commands/types.js";
import { ensureGuild } from "../../watch/service.js";
import { settingsEmbed } from "../embeds.js";
import { invalidateGatehouseSettings } from "../service.js";

const MAX_STAFF_ROLES = 10;

export const security: Command = {
  data: guildCommand(
    "security",
    "View or change Gatehouse settings: anti-raid, alerts and staff roles.",
    PermissionFlagsBits.ManageGuild,
  )
    .addChannelOption((o) =>
      o
        .setName("alert_channel")
        .setDescription("Where raid alerts and flags go")
        .addChannelTypes(ChannelType.GuildText),
    )
    .addBooleanOption((o) => o.setName("anti_raid").setDescription("Watch the join rate for raids"))
    .addIntegerOption((o) =>
      o
        .setName("raid_joins")
        .setDescription("Joins that count as a raid (default: 10)")
        .setMinValue(3)
        .setMaxValue(200),
    )
    .addIntegerOption((o) =>
      o
        .setName("raid_window_seconds")
        .setDescription("…within this many seconds (default: 30)")
        .setMinValue(5)
        .setMaxValue(600),
    )
    .addStringOption((o) =>
      o
        .setName("raid_response")
        .setDescription("What to do on a raid")
        .addChoices(
          { name: "Lock the server", value: "lockdown" },
          { name: "Alert only", value: "alert" },
        ),
    )
    .addIntegerOption((o) =>
      o
        .setName("auto_unlock_minutes")
        .setDescription(
          "Lift raid lockdowns after this long. 0 waits for /lockdown end (default: 15)",
        )
        .setMinValue(0)
        .setMaxValue(1440),
    )
    .addIntegerOption((o) =>
      o
        .setName("flag_account_age_days")
        .setDescription("Flag joining accounts younger than this. 0 turns flags off (default: 7)")
        .setMinValue(0)
        .setMaxValue(365),
    )
    .addRoleOption((o) =>
      o.setName("staff_role_add").setDescription("A role that keeps talking during lockdowns"),
    )
    .addRoleOption((o) => o.setName("staff_role_remove").setDescription("Stop exempting this role"))
    .addBooleanOption((o) =>
      o
        .setName("clear_alert_channel")
        .setDescription("Send alerts to the Watch log channel instead"),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    await ensureGuild(ctx, interaction.guild);
    const o = interaction.options;
    const current = await getGatehouseSettings(ctx.db, interaction.guild.id);
    const patch: GatehouseSettingsPatch = {};

    const channel = o.getChannel("alert_channel");
    if (channel) patch.alertChannelId = channel.id;
    if (o.getBoolean("clear_alert_channel")) patch.alertChannelId = null;
    const antiRaid = o.getBoolean("anti_raid");
    if (antiRaid !== null) patch.antiRaidEnabled = antiRaid;
    const joins = o.getInteger("raid_joins");
    if (joins !== null) patch.raidJoinCount = joins;
    const window = o.getInteger("raid_window_seconds");
    if (window !== null) patch.raidWindowSeconds = window;
    const response = o.getString("raid_response");
    if (response === "lockdown" || response === "alert") patch.raidResponse = response;
    const unlock = o.getInteger("auto_unlock_minutes");
    if (unlock !== null) patch.autoUnlockMinutes = unlock;
    const flagDays = o.getInteger("flag_account_age_days");
    if (flagDays !== null) patch.flagAccountAgeDays = flagDays;

    const add = o.getRole("staff_role_add");
    const remove = o.getRole("staff_role_remove");
    if (add || remove) {
      let roles = current.staffRoleIds.filter((id) => id !== remove?.id);
      if (add && !roles.includes(add.id)) {
        if (add.id === interaction.guild.roles.everyone.id) {
          await interaction.reply({
            content: "@everyone can't be a staff role: lockdowns would lock nobody.",
            ...ephemeral,
          });
          return;
        }
        if (roles.length >= MAX_STAFF_ROLES) {
          await interaction.reply({
            content: `You can exempt ${MAX_STAFF_ROLES} staff roles at most. Remove one first.`,
            ...ephemeral,
          });
          return;
        }
        roles = [...roles, add.id];
      }
      patch.staffRoleIds = roles;
    }

    const changed = Object.keys(patch).length > 0;
    const settings = changed
      ? await updateGatehouseSettings(ctx.db, interaction.guild.id, patch)
      : current;
    if (changed) invalidateGatehouseSettings(interaction.guild.id);
    await interaction.reply({ embeds: [settingsEmbed(settings, changed)], ...ephemeral });
  },
};
