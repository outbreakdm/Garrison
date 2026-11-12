import {
  getOpenDmTicket,
  getTicketConfig,
  listModmailGuildIds,
  nextTicketNumber,
  openTicket,
  recordTicketEvent,
  recordTicketMessage,
  type TicketAttachment,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type Client,
  type Guild,
  type Message,
  PermissionFlagsBits,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { openingCard } from "./panel.js";
import { ticketChannel, trackOpenTicket } from "./service.js";

/**
 * Modmail: a member DMs Garrison, picks which server's staff to reach (servers
 * that turned modmail on and that they're in), and a staff-only ticket channel
 * opens. Their DMs are relayed in; staff replies are relayed back (see
 * relayToMember). The first message waits here until they pick a server.
 */

const PENDING_MS = 10 * 60_000;
const PROMPT_EVERY_MS = 2 * 60_000;
const pending = new Map<string, { message: Message; at: number }>();
const lastPrompt = new Map<string, number>();

const files = (m: Message): TicketAttachment[] =>
  [...m.attachments.values()].slice(0, 10).map((a) => ({ name: a.name.slice(0, 200), url: a.url }));

/** Servers this user can reach by DM: modmail on, Garrison in, and they're a member. */
async function reachable(ctx: BotContext, client: Client<true>, userId: string) {
  const out: Guild[] = [];
  for (const id of await listModmailGuildIds(ctx.db)) {
    const guild = client.guilds.cache.get(id);
    if (!guild) continue;
    const member =
      guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (member) out.push(guild);
  }
  return out.slice(0, 5);
}

/** Put a DM into a ticket's channel and its transcript. */
async function relayIn(
  ctx: BotContext,
  client: Client<true>,
  message: Message,
  ticket: { id: string; guildId: string; channelId: string },
) {
  const guild = client.guilds.cache.get(ticket.guildId);
  const channel = guild?.channels.cache.get(ticket.channelId);
  if (!channel?.isSendable()) return false;
  const links = [...message.attachments.values()].map((a) => a.url);
  await channel.send({
    content:
      `**${safeText(message.author.username)}** (by DM): ${[message.content, ...links].filter(Boolean).join("\n")}`.slice(
        0,
        2000,
      ),
    allowedMentions: { parse: [] },
  });
  await recordTicketMessage(ctx.db, {
    ticketId: ticket.id,
    guildId: ticket.guildId,
    discordMessageId: message.id,
    authorId: message.author.id,
    authorName: message.author.username,
    staff: false,
    content: message.content,
    attachments: files(message),
    createdAt: message.createdAt,
  });
  return true;
}

/** A DM to Garrison. Relayed if they have a DM ticket open; else they pick a server. */
export async function onDirectMessage(ctx: BotContext, client: Client<true>, message: Message) {
  if (message.inGuild() || message.author.bot || message.system) return;
  const open = await getOpenDmTicket(ctx.db, message.author.id);
  if (open) {
    const ok = await relayIn(ctx, client, message, open);
    await message.react(ok ? "📨" : "⚠️").catch(() => null);
    return;
  }
  pending.set(message.author.id, { message, at: Date.now() });
  if (Date.now() - (lastPrompt.get(message.author.id) ?? 0) < PROMPT_EVERY_MS) return;
  lastPrompt.set(message.author.id, Date.now());
  const guilds = await reachable(ctx, client, message.author.id);
  if (!guilds.length) {
    await message
      .reply({
        content:
          "None of the servers we share take messages here. Ask a moderator in the server instead.",
        allowedMentions: { parse: [] },
      })
      .catch(() => null);
    return;
  }
  await message
    .reply({
      content: "Which server's staff should get this? They'll answer here.",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          guilds.map((g) =>
            new ButtonBuilder()
              .setCustomId(`mm:open:${g.id}`)
              .setLabel(g.name.slice(0, 80))
              .setStyle(ButtonStyle.Secondary),
          ),
        ),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
}

/** They picked a server: open a staff-only ticket channel and send the waiting message in. */
export async function onModmailPick(ctx: BotContext, interaction: ButtonInteraction) {
  const guildId = /^mm:open:(\d{17,20})$/.exec(interaction.customId)?.[1];
  const guild = guildId ? interaction.client.guilds.cache.get(guildId) : undefined;
  const reply = (content: string) =>
    interaction.update({ content, components: [], allowedMentions: { parse: [] } });
  if (!guild) return reply("That server isn't available any more.");
  const config = await getTicketConfig(ctx.db, guild.id);
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!config.modmail || !member) return reply("That server doesn't take messages here any more.");
  if (await getOpenDmTicket(ctx.db, interaction.user.id))
    return reply("You already have a conversation open. Just keep writing here.");
  const wait = pending.get(interaction.user.id);
  if (!wait || Date.now() - wait.at > PENDING_MS)
    return reply("That message is too old. Send it again and pick the server.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
    return reply("That server's staff can't receive messages right now.");
  await interaction.deferUpdate();
  const number = await nextTicketNumber(ctx.db, guild.id);
  const channel = await ticketChannel(
    guild,
    me,
    config,
    null,
    number,
    "Direct message",
    interaction.user.username,
  );
  const ticket = await openTicket(ctx.db, {
    guildId: guild.id,
    number,
    panelId: "modmail",
    topicId: "modmail",
    topicLabel: "Direct message",
    openerId: member.id,
    openerName: member.displayName,
    channelId: channel.id,
    answers: [],
    viaDm: true,
  }).catch(async (error: unknown) => {
    await channel.delete("Ticket could not be recorded").catch(() => null);
    throw error;
  });
  if (ticket.number !== number)
    await channel.setName(`ticket-${String(ticket.number).padStart(4, "0")}`);
  trackOpenTicket(channel.id, {
    ticketId: ticket.id,
    guildId: guild.id,
    openerId: member.id,
    viaDm: true,
  });
  await recordTicketEvent(ctx.db, {
    ticketId: ticket.id,
    guildId: guild.id,
    text: `${member.displayName} opened this ticket by DM.`,
  });
  await channel.send({
    ...cardMessage({
      ...openingCard(ticket, config),
      blocks: [
        {
          text: `<@${member.id}> messaged Garrison. They can't see this channel: what you write here goes to their DMs. Start a line with \`//\` to keep it here.`,
        },
      ],
    }),
    allowedMentions: { roles: config.pingStaff ? config.staffRoleIds : [] },
  });
  pending.delete(interaction.user.id);
  await relayIn(ctx, interaction.client as Client<true>, wait.message, ticket);
  await interaction.editReply({
    content: `Sent to the staff of **${safeText(guild.name)}**. Their replies arrive here; keep writing to add more.`,
    components: [],
  });
}
