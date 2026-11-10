import {
  capacity,
  claimRallyNotify,
  closeLfg,
  createLfgPost,
  findOpenLfgByHost,
  getLfgPost,
  joinLfg,
  type LfgPost,
  leaveLfg,
  listActiveMembers,
  listOpenLfg,
  renderWording,
  setLfgMessage,
} from "@garrison/db";
import { type Guild, PermissionFlagsBits, type SendableChannels } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { BotContext, ButtonHandler, Command } from "../../commands/types.js";
import { brandEmbed, done, failed, info } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { lfgCard, RALLY_PREFIX, safeText } from "./card.js";
import { LIFETIME_AFTER_START_MS, matchSlot, parseSlots, parseStart } from "./parse.js";
import { announceFullSquad, refreshCard, syncVoiceAccess } from "./service.js";
import { cachedTemplates, findTemplate, postWording } from "./templates.js";

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
        .addStringOption((o) =>
          o
            .setName("template")
            .setDescription("One of this server's templates, like Mythic+ or Ranked")
            .setAutocomplete(true)
            .setMaxLength(32),
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
          ...info("No open groups. Post one with /lfg create."),
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
        await interaction.reply({ ...failed("You don't have an open group."), ...ephemeral });
        return;
      }
      await refreshCard(ctx, guild, closed);
      await interaction.reply({ ...done("Closed your group."), ...ephemeral });
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({ ...failed("I can't post in this channel."), ...ephemeral });
      return;
    }
    const { templates } = await cachedTemplates(ctx, guild.id);
    const picked = interaction.options.getString("template");
    const template = findTemplate(templates, picked);
    if (picked && !template) {
      await interaction.reply({
        ...failed(
          templates.length
            ? `No template called "${safeText(picked)}". Pick one from the list.`
            : "This server has no templates yet. A moderator can add them on the dashboard.",
        ),
        ...ephemeral,
      });
      return;
    }
    if (template?.channelIds.length && !template.channelIds.includes(channel.id)) {
      await interaction.reply({
        ...failed(
          `${safeText(template.name)} groups go in ${template.channelIds.map((c) => `<#${c}>`).join(", ")}.`,
        ),
        ...ephemeral,
      });
      return;
    }
    // What the player typed wins; otherwise the template's defaults.
    const typedRoles = interaction.options.getString("roles");
    const typedSize = interaction.options.getInteger("size");
    const slots = parseSlots(
      typedRoles ?? (typedSize ? null : (template?.roles ?? null)),
      typedSize ?? template?.size ?? null,
    );
    if (!slots.ok) {
      await interaction.reply({ ...failed(slots.error), ...ephemeral });
      return;
    }
    const start = parseStart(interaction.options.getString("starts"));
    if (!start.ok) {
      await interaction.reply({ ...failed(start.error), ...ephemeral });
      return;
    }
    const hostSlot = matchSlot(slots.value, interaction.options.getString("my_role"));
    if (hostSlot === null) {
      await interaction.reply({
        ...failed(`Pick your role from: ${slots.value.map((g) => safeText(g.name)).join(", ")}.`),
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
      expiresAt: new Date(
        start.value.getTime() +
          (template ? template.lifetimeHours * 3_600_000 : LIFETIME_AFTER_START_MS),
      ),
      templateId: template?.id ?? null,
      wording: template ? { ...template.wording, voice: template.voice } : null,
    });
    if (!post) {
      await interaction.reply({
        ...failed("You already have an open group. Close it with /lfg close first."),
        ...ephemeral,
      });
      return;
    }
    const members = await listActiveMembers(ctx.db, post.id);
    const message = await interaction.reply({ ...lfgCard(post, members), withResponse: true });
    const sent = message.resource?.message;
    if (sent) await setLfgMessage(ctx.db, post.id, sent.id);
    if (template?.notifyRoleId && sent)
      await notifyTemplateRole(ctx, guild, channel, post, template.notifyRoleId, sent.url);
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "template") {
      await interaction.respond([]);
      return;
    }
    const { templates } = await cachedTemplates(ctx, interaction.guildId);
    const q = focused.value.trim().toLowerCase();
    await interaction.respond(
      templates
        .filter((t) => !t.channelIds.length || t.channelIds.includes(interaction.channelId))
        .filter((t) => `${t.name} ${t.game ?? ""}`.toLowerCase().includes(q))
        .slice(0, 25)
        .map((t) => ({
          name: (t.game ? `${t.name} · ${t.game}` : t.name).slice(0, 100),
          value: t.id,
        })),
    );
  },
};

/**
 * Pro: tell a template's role a group is up. One ping per template every 15
 * minutes, only that role, and only if Discord lets Garrison mention it.
 */
export async function notifyTemplateRole(
  ctx: BotContext,
  guild: Guild,
  channel: SendableChannels,
  post: LfgPost,
  roleId: string,
  url: string,
) {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role || !me) return;
  if (!role.mentionable && !me.permissions.has(PermissionFlagsBits.MentionEveryone)) return;
  if (!(await claimRallyNotify(ctx.db, guild.id, post.templateId ?? "", post.id))) return;
  const w = postWording(post.wording);
  await channel
    .send({
      content: `<@&${role.id}> ${safeText(renderWording("New {group}", w))}: ${safeText(post.title)} ${url}`,
      allowedMentions: { roles: [role.id], users: [], parse: [] },
    })
    .catch((error: unknown) => ctx.logger.warn("Could not notify a Rally role", { error }));
}

const UUID = /^[0-9a-f-]{36}$/;

export const rallyButtons: ButtonHandler = {
  prefix: RALLY_PREFIX,
  async execute(interaction, ctx) {
    const [, action, postId, index] = interaction.customId.split(":");
    if (!postId || !UUID.test(postId)) return;
    const post = await getLfgPost(ctx.db, interaction.guild.id, postId);
    if (!post) {
      await interaction.reply({ ...failed("That group is gone."), ...ephemeral });
      return;
    }
    const userId = interaction.user.id;

    if (action === "close") {
      const canModerate = interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages);
      if (userId !== post.hostId && !canModerate) {
        await interaction.reply({
          ...failed("Only the host or a moderator can close this group."),
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
        await interaction.reply({ ...failed(msg), ...ephemeral });
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
          full: renderWording("{Group}'s full.", postWording(post.wording)),
          slot_full: `${group.name || "That role"} is full. Pick another role.`,
          no_such_slot: "That role doesn't exist any more.",
        }[result.reason];
        await interaction.reply({ ...failed(msg), ...ephemeral });
        return;
      }
      await interaction.update(lfgCard(result.post, result.members));
      await syncVoiceAccess(interaction.guild, result.post, userId, true);
      if (result.becameFull)
        await announceFullSquad(ctx, interaction.guild, result.post, result.members);
    }
  },
};
