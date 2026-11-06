import {
  capacity,
  closeLfg,
  createLfgPost,
  findOpenLfgByHost,
  getLfgPost,
  joinLfg,
  leaveLfg,
  listActiveMembers,
  listOpenLfg,
  setLfgMessage,
} from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command } from "../../commands/types.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { lfgCard, RALLY_PREFIX, safeText } from "./card.js";
import { LIFETIME_AFTER_START_MS, matchSlot, parseSlots, parseStart } from "./parse.js";
import { announceFullSquad, refreshCard, syncVoiceAccess } from "./service.js";

const TITLE_MAX = 80;
const NOTE_MAX = 120;

export const lfg: Command = {
  data: guildCommand("lfg", "Find a group: post an LFG card people can join.", null)
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Post a group in this channel")
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription('What you\'re running, e.g. "Mythic+ 12 · Ara-Kara"')
            .setRequired(true)
            .setMaxLength(TITLE_MAX),
        )
        .addIntegerOption((o) =>
          o
            .setName("size")
            .setDescription("Players including you, if you don't list roles (default: 5)")
            .setMinValue(2)
            .setMaxValue(40),
        )
        .addStringOption((o) =>
          o
            .setName("roles")
            .setDescription('Slots by role, e.g. "Tank 1, Healer 1, DPS 3"')
            .setMaxLength(120),
        )
        .addStringOption((o) =>
          o
            .setName("my_role")
            .setDescription("Your role, if you listed roles (default: the first)")
            .setMaxLength(20),
        )
        .addStringOption((o) =>
          o
            .setName("starts")
            .setDescription('"now", or a time from now like 10m or 2h')
            .setMaxLength(16),
        )
        .addStringOption((o) =>
          o
            .setName("note")
            .setDescription('Requirements, e.g. "rank Gold+"')
            .setMaxLength(NOTE_MAX),
        ),
    )
    .addSubcommand((s) => s.setName("close").setDescription("Close your open group"))
    .addSubcommand((s) => s.setName("list").setDescription("Show open groups in this server"))
    .toJSON(),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);

    if (sub === "list") {
      const posts = await listOpenLfg(ctx.db, guild.id);
      if (!posts.length) {
        await interaction.reply({
          content: "No open groups. Post one with /lfg create.",
          ...ephemeral,
        });
        return;
      }
      const lines = await Promise.all(
        posts.slice(0, 15).map(async (p) => {
          const filled = (await listActiveMembers(ctx.db, p.id)).length;
          const link = p.messageId
            ? `https://discord.com/channels/${guild.id}/${p.channelId}/${p.messageId}`
            : `<#${p.channelId}>`;
          return `[${safeText(p.title)}](${link}) · ${filled}/${capacity(p.slots)} · <@${p.hostId}>`;
        }),
      );
      await interaction.reply({
        embeds: [
          brandEmbed({
            title: `${posts.length} open ${posts.length === 1 ? "group" : "groups"}`,
            description: lines.join("\n"),
            module: "rally",
          }),
        ],
        ...ephemeral,
      });
      return;
    }

    if (sub === "close") {
      const mine = await findOpenLfgByHost(ctx.db, guild.id, interaction.user.id);
      const closed = mine ? await closeLfg(ctx.db, mine.id) : null;
      if (!closed) {
        await interaction.reply({ content: "You don't have an open group.", ...ephemeral });
        return;
      }
      await refreshCard(ctx, guild, closed);
      await interaction.reply({ content: "Closed your group.", ...ephemeral });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({ content: "I can't post in this channel.", ...ephemeral });
      return;
    }
    const slots = parseSlots(
      interaction.options.getString("roles"),
      interaction.options.getInteger("size"),
    );
    if (!slots.ok) {
      await interaction.reply({ content: slots.error, ...ephemeral });
      return;
    }
    const start = parseStart(interaction.options.getString("starts"));
    if (!start.ok) {
      await interaction.reply({ content: start.error, ...ephemeral });
      return;
    }
    const hostSlot = matchSlot(slots.value, interaction.options.getString("my_role"));
    if (hostSlot === null) {
      await interaction.reply({
        content: `Pick your role from: ${slots.value.map((g) => g.name).join(", ")}.`,
        ...ephemeral,
      });
      return;
    }

    const post = await createLfgPost(ctx.db, {
      guildId: guild.id,
      channelId: channel.id,
      hostId: interaction.user.id,
      hostSlot,
      title: interaction.options.getString("title", true).trim(),
      note: interaction.options.getString("note")?.trim() || null,
      slots: slots.value,
      startsAt: start.value,
      expiresAt: new Date(start.value.getTime() + LIFETIME_AFTER_START_MS),
    });
    if (!post) {
      await interaction.reply({
        content: "You already have an open group. Close it with /lfg close first.",
        ...ephemeral,
      });
      return;
    }
    const members = await listActiveMembers(ctx.db, post.id);
    const message = await interaction.reply({ ...lfgCard(post, members), withResponse: true });
    const sent = message.resource?.message;
    if (sent) await setLfgMessage(ctx.db, post.id, sent.id);
  },
};

const UUID = /^[0-9a-f-]{36}$/;

export const rallyButtons: ButtonHandler = {
  prefix: RALLY_PREFIX,
  async execute(interaction, ctx) {
    const [, action, postId, index] = interaction.customId.split(":");
    if (!postId || !UUID.test(postId)) return;
    const post = await getLfgPost(ctx.db, interaction.guild.id, postId);
    if (!post) {
      await interaction.reply({ content: "That group is gone.", ...ephemeral });
      return;
    }
    const userId = interaction.user.id;

    if (action === "close") {
      const canModerate = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
      if (userId !== post.hostId && !canModerate) {
        await interaction.reply({
          content: "Only the host or a moderator can close this group.",
          ...ephemeral,
        });
        return;
      }
      const closed = await closeLfg(ctx.db, post.id);
      await interaction.update(lfgCard(closed ?? post, await listActiveMembers(ctx.db, post.id)));
      return;
    }

    if (action === "leave") {
      const result = await leaveLfg(ctx.db, post.id, userId);
      if (!result.ok) {
        const msg =
          result.reason === "not_member" ? "You're not in this group." : "This group is closed.";
        await interaction.reply({ content: msg, ...ephemeral });
        return;
      }
      await interaction.update(lfgCard(result.post, result.members));
      await syncVoiceAccess(interaction.guild, result.post, userId, false);
      return;
    }

    if (action === "join") {
      const group = post.slots[Number(index)];
      if (!group) return;
      const result = await joinLfg(ctx.db, post.id, userId, group.name);
      if (!result.ok) {
        const msg = {
          not_found: "That group is gone.",
          closed: "This group is closed.",
          already: "You're already in this group.",
          full: "Squad's full.",
          slot_full: `${group.name || "That role"} is full. Pick another role.`,
          no_such_slot: "That role doesn't exist any more.",
        }[result.reason];
        await interaction.reply({ content: msg, ...ephemeral });
        return;
      }
      await interaction.update(lfgCard(result.post, result.members));
      await syncVoiceAccess(interaction.guild, result.post, userId, true);
      if (result.becameFull)
        await announceFullSquad(ctx, interaction.guild, result.post, result.members);
    }
  },
};
