import {
  cleanRankDetails,
  entitlements,
  getGuildPlan,
  getLeaderboard,
  getMemberRank,
  getRankDetails,
  getSharedLinks,
  levelForXp,
  listRankRewards,
  RANK_CARD_LIMITS,
  rankCardForPlan,
  readRankCard,
  saveRankDetails,
  setRankReward,
  updateRanksSettings,
} from "@garrison/db";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelType,
  type GuildMember,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type User,
} from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { BotContext, Command, ModalHandler } from "../../commands/types.js";
import { cardReply } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { plainLink } from "../barracks/format.js";
import { rankCardPng } from "./render.js";
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

const OFF = "Ranks are off in this server. A moderator can turn them on with `/ranks settings`.";

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
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const png = await rankImage(ctx, interaction.guild.id, user, member, {
      level: r.level,
      position: r.position,
      xpInto: intoLevel,
      xpNeeded: needed,
      totalXp: r.xp,
    }).catch((error: unknown) => {
      ctx.logger.warn("Rank card failed to draw", { guildId: interaction.guild.id, error });
      return null;
    });
    if (png) {
      await interaction.editReply({
        files: [
          new AttachmentBuilder(png, {
            name: "rank.png",
            description: `${user.username}'s rank card`,
          }),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    }
    // The text card, if drawing failed.
    await interaction.editReply(
      cardReply(
        {
          title: safeText(user.username),
          status: `Level ${r.level}`,
          lead: `#${r.position} in the server`,
          blocks: [
            {
              text: `\`${progressBar(intoLevel, needed)}\` ${intoLevel} / ${needed} XP to level ${r.level + 1}`,
            },
            {
              text: `**Total XP:** ${r.xp.toLocaleString("en-US")} · **Messages:** ${r.messages.toLocaleString("en-US")}`,
            },
          ],
          module: "ranks",
        },
        { ephemeral: false },
      ),
    );
  },
};

/** Everything drawn on a member's rank card, by this server's plan and setup. */
async function rankImage(
  ctx: BotContext,
  guildId: string,
  user: User,
  member: GuildMember | null,
  numbers: { level: number; position: number; xpInto: number; xpNeeded: number; totalXp: number },
) {
  const [settings, plan] = await Promise.all([
    cachedRanksSettings(ctx, guildId),
    getGuildPlan(ctx.db, guildId),
  ]);
  const style = rankCardForPlan(readRankCard(settings.card), entitlements(plan));
  const [answers, links] = await Promise.all([
    style.fields.length
      ? getRankDetails(ctx.db, guildId, user.id)
      : Promise.resolve<Record<string, string>>({}),
    style.showLinked ? getSharedLinks(ctx.db, guildId, user.id) : Promise.resolve([]),
  ]);
  return rankCardPng({
    style,
    name: member?.displayName ?? user.displayName,
    avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", size: 256 }),
    ...numbers,
    details: style.fields.flatMap((f) =>
      answers[f.id] ? [{ label: f.label, value: answers[f.id] as string }] : [],
    ),
    linked: links.map((l) => plainLink(l, { proof: false })),
  });
}

/** /rankcard: a member fills in the details their server's rank card shows (Pro). */
export const rankcard: Command = {
  data: guildCommand("rankcard", "Fill in the details on your rank card.", null).toJSON(),
  async execute(interaction, ctx) {
    const [settings, plan] = await Promise.all([
      cachedRanksSettings(ctx, interaction.guild.id),
      getGuildPlan(ctx.db, interaction.guild.id),
    ]);
    if (!settings.enabled) {
      await interaction.reply({ content: OFF, ...ephemeral });
      return;
    }
    const style = rankCardForPlan(readRankCard(settings.card), entitlements(plan));
    if (!style.fields.length) {
      await interaction.reply({
        content: "This server's rank cards have no details to fill in.",
        ...ephemeral,
      });
      return;
    }
    const answers = await getRankDetails(ctx.db, interaction.guild.id, interaction.user.id);
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("rankcard:edit")
        .setTitle("Your rank card")
        .addComponents(
          style.fields.map((f) =>
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId(f.id)
                .setLabel(f.label)
                .setStyle(TextInputStyle.Short)
                .setMaxLength(RANK_CARD_LIMITS.value)
                .setRequired(false)
                .setValue(answers[f.id] ?? ""),
            ),
          ),
        ),
    );
  },
};

export const rankcardModals: ModalHandler = {
  prefix: "rankcard",
  async execute(interaction, ctx) {
    const settings = await cachedRanksSettings(ctx, interaction.guild.id);
    const style = readRankCard(settings.card);
    // Checked against the fields saved now: answers for removed fields are dropped.
    const raw = Object.fromEntries(
      style.fields.map((f) => {
        let v = "";
        try {
          v = interaction.fields.getTextInputValue(f.id);
        } catch {
          v = "";
        }
        return [f.id, v];
      }),
    );
    await saveRankDetails(
      ctx.db,
      interaction.guild.id,
      interaction.user.id,
      cleanRankDetails(style.fields, raw),
    );
    await interaction.reply({ content: "Saved. Your card shows them on `/rank`.", ...ephemeral });
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
        `${i + 1}. <@${m.userId}> · **level ${m.level}** · ${m.xp.toLocaleString("en-US")} XP`,
    );
    await interaction.reply(
      cardReply(
        {
          title: "Leaderboard",
          lead: "Most XP in the server",
          blocks: [{ text: lines.join("\n") }],
          module: "ranks",
          ref: "top 10",
        },
        { ephemeral: false },
      ),
    );
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
      const saved = Object.keys(patch).length > 0;
      await interaction.reply(
        cardReply({
          tone: saved ? "go" : "volt",
          title: saved ? "Ranks settings saved" : "Ranks settings",
          facts: [
            { label: "Ranks", value: s.enabled ? "On" : "Off" },
            { label: "Level-ups", value: where },
          ],
          module: "ranks",
        }),
      );
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
        : "No level rewards. Add one with `/ranks reward`.",
      ...ephemeral,
    });
  },
};
