import { getLeaderboard, getMemberRank, levelForXp, listRankRewards } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { linkRow, serverUrl, settingsReply } from "../../lib/dashboard.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { progressBar } from "./rules.js";
import { cachedRanksSettings } from "./service.js";

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

const OFF = "Ranks are off in this server. A moderator can turn them on in the dashboard.";

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

/**
 * Ranks settings and level rewards are changed on the dashboard, with history
 * and undo. The subcommands people know stay, and show where things are at.
 */
export const ranks: Command = {
  data: guildCommand(
    "ranks",
    "See leveling settings and rewards, with a link to change them on the dashboard.",
    PermissionFlagsBits.ManageGuild,
  )
    .addSubcommand((s) =>
      s.setName("settings").setDescription("Ranks on or off, and where level-ups are announced"),
    )
    .addSubcommand((s) =>
      s.setName("reward").setDescription("Give a role at a level, on the dashboard"),
    )
    .addSubcommand((s) =>
      s.setName("unreward").setDescription("Stop giving a role at a level, on the dashboard"),
    )
    .addSubcommand((s) => s.setName("rewards").setDescription("List level rewards"))
    .toJSON(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);
    const sub = interaction.options.getSubcommand();

    if (sub === "settings") {
      const s = await cachedRanksSettings(ctx, guild.id);
      const where =
        s.announce === "off"
          ? "Off"
          : s.announce === "channel"
            ? `<#${s.announceChannelId}>`
            : "Where they leveled up";
      await interaction.reply(
        settingsReply({
          subject: "Ranks settings are",
          url: serverUrl(guild.id, "ranks?edit=settings#settings"),
          label: "Change Ranks settings",
          embed: brandEmbed({
            title: "Ranks settings",
            fields: [
              { name: "Ranks", value: s.enabled ? "On" : "Off", inline: true },
              { name: "Level-ups", value: where, inline: true },
            ],
            module: "ranks",
          }),
        }),
      );
      return;
    }

    const rewards = await listRankRewards(ctx.db, guild.id);
    const list = rewards.length
      ? rewards.map((r) => `Level ${r.level}: <@&${r.roleId}>`).join("\n")
      : "No level rewards yet.";
    const url = serverUrl(guild.id, "ranks?edit=rewards#rewards");
    if (sub === "rewards") {
      await interaction.reply({
        content: list,
        components: url ? [linkRow(url, "Change level rewards")] : [],
        ...ephemeral,
      });
      return;
    }
    await interaction.reply(
      settingsReply({
        subject: "Level rewards are",
        url,
        label: "Change level rewards",
        embed: brandEmbed({ title: "Level rewards", description: list, module: "ranks" }),
      }),
    );
  },
};
