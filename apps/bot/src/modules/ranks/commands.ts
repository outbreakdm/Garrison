import {
  getLeaderboard,
  getMemberRank,
  levelForXp,
  listRankRewards,
  setRankReward,
  updateRanksSettings,
} from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { progressBar, rewardProblem, rewardProblemText } from "./rules.js";
import { cachedRanksSettings, invalidateRanksSettings } from "./service.js";

/** /rank and /leaderboard are open to everyone, so each person gets one every 10 s. */
const LOOKUP_COOLDOWN_MS = 10_000;
const lastLookup = new Map<string, number>();
function rateLimited(userId: string) {
  const now = Date.now();
  if (now - (lastLookup.get(userId) ?? 0) < LOOKUP_COOLDOWN_MS) return true;
  lastLookup.set(userId, now);
  if (lastLookup.size > 50_000) lastLookup.clear();
  return false;
}

const OFF = "Ranks are off in this server. A moderator can turn them on with /ranks settings.";

export const rank: Command = {
  data: guildCommand("rank", "Show your level and XP, or someone else's.", null)
    .addUserOption((o) => o.setName("user").setDescription("Whose rank to show"))
    .toJSON(),
  async execute(interaction, ctx) {
    if (rateLimited(interaction.user.id)) {
      await interaction.reply({ content: "One rank lookup every 10 s.", ...ephemeral });
      return;
    }
    if (!(await cachedRanksSettings(ctx, interaction.guild.id)).enabled) {
      await interaction.reply({ content: OFF, ...ephemeral });
      return;
    }
    const user = interaction.options.getUser("user") ?? interaction.user;
    const r = await getMemberRank(ctx.db, interaction.guild.id, user.id);
    if (!r) {
      await interaction.reply({ content: `<@${user.id}> hasn't earned any XP yet.`, ...ephemeral });
      return;
    }
    const { intoLevel, needed } = levelForXp(r.xp);
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: `${safeText(user.username)} · level ${r.level}`,
          description: `\`${progressBar(intoLevel, needed)}\` ${intoLevel} / ${needed} XP to level ${r.level + 1}`,
          fields: [
            { name: "Rank", value: `#${r.position}`, inline: true },
            { name: "Total XP", value: r.xp.toLocaleString("en-US"), inline: true },
            { name: "Messages", value: r.messages.toLocaleString("en-US"), inline: true },
          ],
          module: "ranks",
        }),
      ],
    });
  },
};

export const leaderboard: Command = {
  data: guildCommand("leaderboard", "Show the server's top 10 by XP.", null).toJSON(),
  async execute(interaction, ctx) {
    if (rateLimited(interaction.user.id)) {
      await interaction.reply({ content: "One rank lookup every 10 s.", ...ephemeral });
      return;
    }
    if (!(await cachedRanksSettings(ctx, interaction.guild.id)).enabled) {
      await interaction.reply({ content: OFF, ...ephemeral });
      return;
    }
    const top = await getLeaderboard(ctx.db, interaction.guild.id, 10);
    if (!top.length) {
      await interaction.reply({ content: "Nobody has XP yet. Start talking.", ...ephemeral });
      return;
    }
    const lines = top.map(
      (m, i) =>
        `\`#${String(i + 1).padStart(2)}\` <@${m.userId}> · level ${m.level} · ${m.xp.toLocaleString("en-US")} XP`,
    );
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: "Leaderboard",
          description: lines.join("\n"),
          module: "ranks",
          ref: "top 10",
        }),
      ],
    });
  },
};

export const ranks: Command = {
  data: guildCommand(
    "ranks",
    "Set up leveling: turn it on, announcements and level rewards.",
    PermissionFlagsBits.ManageGuild,
  )
    .addSubcommand((s) =>
      s
        .setName("settings")
        .setDescription("Turn ranks on or off and choose where level-ups are announced")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Count XP from messages"))
        .addStringOption((o) =>
          o
            .setName("announce")
            .setDescription("Where to announce level-ups")
            .addChoices(
              { name: "In the channel they leveled up in", value: "same_channel" },
              { name: "In one channel", value: "channel" },
              { name: "Don't announce", value: "off" },
            ),
        )
        .addChannelOption((o) =>
          o
            .setName("announce_channel")
            .setDescription("The channel, if announcing in one channel")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reward")
        .setDescription("Give a role at a level")
        .addIntegerOption((o) =>
          o
            .setName("level")
            .setDescription("Level")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500),
        )
        .addRoleOption((o) => o.setName("role").setDescription("Role to give").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("unreward")
        .setDescription("Stop giving a role at a level")
        .addIntegerOption((o) =>
          o
            .setName("level")
            .setDescription("Level")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500),
        ),
    )
    .addSubcommand((s) => s.setName("rewards").setDescription("List level rewards"))
    .toJSON(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);
    const sub = interaction.options.getSubcommand();

    if (sub === "settings") {
      const enabled = interaction.options.getBoolean("enabled");
      const announce = interaction.options.getString("announce");
      const channel = interaction.options.getChannel("announce_channel");
      const patch: Parameters<typeof updateRanksSettings>[2] = {};
      if (enabled !== null) patch.enabled = enabled;
      if (announce === "off" || announce === "same_channel" || announce === "channel")
        patch.announce = announce;
      if (channel) patch.announceChannelId = channel.id;
      if (
        patch.announce === "channel" &&
        !channel &&
        !(await cachedRanksSettings(ctx, guild.id)).announceChannelId
      ) {
        await interaction.reply({
          content: "Pick the channel with announce_channel.",
          ...ephemeral,
        });
        return;
      }
      const s = Object.keys(patch).length
        ? await updateRanksSettings(ctx.db, guild.id, patch)
        : await cachedRanksSettings(ctx, guild.id);
      invalidateRanksSettings(guild.id);
      const where =
        s.announce === "off"
          ? "Off"
          : s.announce === "channel"
            ? `<#${s.announceChannelId}>`
            : "Where they leveled up";
      await interaction.reply({
        embeds: [
          brandEmbed({
            title: Object.keys(patch).length ? "Saved. Ranks settings updated" : "Ranks settings",
            fields: [
              { name: "Ranks", value: s.enabled ? "On" : "Off", inline: true },
              { name: "Level-ups", value: where, inline: true },
            ],
            module: "ranks",
          }),
        ],
        ...ephemeral,
      });
      return;
    }

    if (sub === "reward") {
      const level = interaction.options.getInteger("level", true);
      const role = interaction.options.getRole("role", true);
      const me = guild.members.me ?? (await guild.members.fetchMe());
      const facts = {
        id: role.id,
        name: role.name,
        managed: role.managed,
        position: role.position,
        permissions: BigInt(role.permissions.valueOf()),
      };
      const problem = rewardProblem(facts, guild.roles.everyone.id, me.roles.highest.position);
      if (problem) {
        await interaction.reply({ content: rewardProblemText(problem, facts), ...ephemeral });
        return;
      }
      await setRankReward(ctx.db, guild.id, level, role.id);
      await interaction.reply({
        content: `Saved. Members get <@&${role.id}> at level ${level}.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "unreward") {
      const level = interaction.options.getInteger("level", true);
      await setRankReward(ctx.db, guild.id, level, null);
      await interaction.reply({ content: `Saved. No reward at level ${level}.`, ...ephemeral });
      return;
    }

    const rewards = await listRankRewards(ctx.db, guild.id);
    await interaction.reply({
      content: rewards.length
        ? rewards.map((r) => `Level ${r.level}: <@&${r.roleId}>`).join("\n")
        : "No level rewards. Add one with /ranks reward.",
      ...ephemeral,
    });
  },
};
