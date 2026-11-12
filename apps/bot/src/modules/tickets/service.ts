import {
  activeQuestions,
  claimTicket,
  closeTicket,
  countOpenTickets,
  type Entitlements,
  editTicketMessage,
  entitlements,
  expiresAt,
  getGuildPlan,
  getTicket,
  getTicketConfig,
  isPanelPaused,
  isTopicPaused,
  listClosedTicketChannels,
  listOpenTicketChannels,
  markTicketChannelGone,
  markTicketMessageDeleted,
  nextTicketNumber,
  openClaimCounts,
  openTicket,
  pruneTickets,
  recordTicketEvent,
  recordTicketMessage,
  reopenTicket,
  type Ticket,
  type TicketAnswer,
  type TicketAttachment,
  type TicketConfig,
  type TicketPanel,
  type TicketTopic,
  ticketChannelName,
} from "@garrison/db";
import {
  type Attachment,
  ChannelType,
  type Client,
  type Collection,
  type Guild,
  type GuildMember,
  type Message,
  type OverwriteResolvable,
  type PartialMessage,
  PermissionFlagsBits,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { type Card, cardMessage } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { isTicketStaff, openingCard } from "./panel.js";

/**
 * Tickets: private channels opened from a panel. Transcripts are recorded as
 * messages arrive (this is why Garrison asks for Message Content), kept with the
 * ticket, and removed with it once the plan's history window has passed.
 */

const SETTINGS_TTL_MS = 30_000;
const CLOSE_DELAY_MS = 10_000;
const configCache = new Map<string, { at: number; value: TicketConfig }>();

/** The setup, cached briefly: it's read on every message in a ticket. */
export async function ticketConfig(ctx: BotContext, guildId: string) {
  const hit = configCache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value;
  const value = await getTicketConfig(ctx.db, guildId);
  configCache.set(guildId, { at: Date.now(), value });
  return value;
}

/** Open ticket channels, so a message is matched to its ticket without a query. */
const open = new Map<string, { ticketId: string; guildId: string; openerId: string }>();

export async function loadOpenTickets(ctx: BotContext) {
  open.clear();
  for (const t of await listOpenTicketChannels(ctx.db))
    open.set(t.channelId, { ticketId: t.id, guildId: t.guildId, openerId: t.openerId });
}

export const ticketInChannel = (channelId: string) => open.get(channelId) ?? null;

const note = (title: string, text: string, tone: Card["tone"] = "caution"): Card => ({
  tone,
  title,
  blocks: [{ text }],
  module: "parley",
});

export interface TicketStart {
  panel: TicketPanel;
  topic: TicketTopic;
  config: TicketConfig;
  ent: Entitlements;
  questions: string[];
}

/** Can this member open a ticket on this topic now? A card saying why not, or what to ask. */
export async function checkStart(
  ctx: BotContext,
  member: GuildMember,
  panelId: string,
  topicId: string,
): Promise<{ ok: true; start: TicketStart } | { ok: false; card: Card }> {
  const [config, plan] = await Promise.all([
    ticketConfig(ctx, member.guild.id),
    getGuildPlan(ctx.db, member.guild.id),
  ]);
  const ent = entitlements(plan);
  const panelIndex = config.panels.findIndex((p) => p.id === panelId);
  const panel = config.panels[panelIndex];
  const topicIndex = panel ? panel.topics.findIndex((t) => t.id === topicId) : -1;
  const topic = panel?.topics[topicIndex];
  if (!panel || !topic)
    return {
      ok: false,
      card: note("This button was removed", "Ask a moderator for the current ticket panel."),
    };
  if (isPanelPaused(panelIndex, ent) || isTopicPaused(topicIndex, ent))
    return {
      ok: false,
      card: note(
        "This is paused",
        "This server has more ticket panels or topics than its plan runs. Nothing was lost: a moderator can change it on the dashboard.",
      ),
    };
  const count = await countOpenTickets(ctx.db, member.guild.id, member.id);
  if (count >= config.maxOpen) {
    const mine = [...open.entries()]
      .filter(([, t]) => t.guildId === member.guild.id && t.openerId === member.id)
      .map(([channelId]) => `<#${channelId}>`);
    return {
      ok: false,
      card: note(
        "You already have a ticket open",
        `Carry on in ${mine.join(", ") || "your open ticket"}. You can have ${config.maxOpen} open at once.`,
      ),
    };
  }
  return { ok: true, start: { panel, topic, config, ent, questions: activeQuestions(topic, ent) } };
}

/** The staff member with the fewest open tickets, for auto-assign (Pro). */
async function pickAssignee(ctx: BotContext, guild: Guild, config: TicketConfig) {
  const staff = new Map<string, GuildMember>();
  for (const id of config.staffRoleIds)
    for (const m of guild.roles.cache.get(id)?.members.values() ?? [])
      if (!m.user.bot) staff.set(m.id, m);
  if (!staff.size) return null;
  const counts = await openClaimCounts(ctx.db, guild.id);
  return [...staff.values()].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0];
}

const TALK = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

/** A private channel for one ticket: the member, the staff roles and Garrison only. */
function ticketChannel(
  guild: Guild,
  me: GuildMember,
  config: TicketConfig,
  member: GuildMember,
  number: number,
  topic: string,
) {
  const parent = config.parentId ? guild.channels.cache.get(config.parentId) : null;
  // Members may attach screenshots only if Garrison itself may (Discord's rule for overwrites).
  const memberAllow = me.permissions.has(PermissionFlagsBits.AttachFiles)
    ? [...TALK, PermissionFlagsBits.AttachFiles]
    : TALK;
  const overwrites: OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: memberAllow },
    { id: me.id, allow: [...TALK, PermissionFlagsBits.EmbedLinks] },
    ...config.staffRoleIds
      .filter((id) => guild.roles.cache.has(id))
      .map((id) => ({ id, allow: memberAllow })),
  ];
  return guild.channels.create({
    name: ticketChannelName(number),
    type: ChannelType.GuildText,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
    permissionOverwrites: overwrites,
    topic: `Ticket #${number} · ${topic} · opened by ${member.user.username}`,
    reason: `Ticket #${number} for ${member.user.username}`,
  });
}

/**
 * Reopen a closed ticket from the dashboard: a fresh channel for the same member
 * and number, and the transcript carries on where it stopped.
 */
export async function reopenClosedTicket(
  ctx: BotContext,
  guild: Guild,
  ticket: Ticket,
  by: GuildMember,
): Promise<{ ok: boolean; message: string }> {
  const config = await getTicketConfig(ctx.db, guild.id);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
    return { ok: false, message: "Garrison needs the Manage Channels permission to open tickets." };
  const opener = await guild.members.fetch(ticket.openerId).catch(() => null);
  if (!opener) return { ok: false, message: `${ticket.openerName} isn't in the server any more.` };
  const channel = await ticketChannel(guild, me, config, opener, ticket.number, ticket.topicLabel);
  const row = await reopenTicket(ctx.db, ticket.id, channel.id);
  if (!row) {
    await channel.delete("Ticket was already open").catch(() => null);
    return { ok: false, message: `Ticket #${ticket.number} is already open.` };
  }
  open.set(channel.id, { ticketId: row.id, guildId: guild.id, openerId: row.openerId });
  await recordTicketEvent(ctx.db, {
    ticketId: row.id,
    guildId: guild.id,
    text: `${by.displayName} reopened this ticket.`,
  });
  await channel.send({
    ...cardMessage({
      ...openingCard(row, config),
      lead: `Reopened by <@${by.id}> for <@${row.openerId}>. The transcript so far is on the dashboard.`,
    }),
    allowedMentions: { users: [row.openerId] },
  });
  return { ok: true, message: `Reopened ticket #${row.number} in #${channel.name}.` };
}

/** Open the ticket: a private channel, the opening card, and a line in the transcript. */
export async function createTicket(
  ctx: BotContext,
  member: GuildMember,
  start: TicketStart,
  answers: TicketAnswer[],
): Promise<Card> {
  const { guild } = member;
  const { config, ent, panel, topic } = start;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
    return note(
      "Garrison can't open tickets",
      "It needs the Manage Channels permission. Ask a moderator to check Garrison's role.",
      "alert",
    );
  const number = await nextTicketNumber(ctx.db, guild.id);
  const channel = await ticketChannel(guild, me, config, member, number, topic.label);
  let ticket: Ticket;
  try {
    const assignee =
      ent["tickets.autoAssign"] && config.autoAssign
        ? await pickAssignee(ctx, guild, config)
        : null;
    ticket = await openTicket(ctx.db, {
      guildId: guild.id,
      number,
      panelId: panel.id,
      topicId: topic.id,
      topicLabel: topic.label,
      openerId: member.id,
      openerName: member.displayName,
      channelId: channel.id,
      answers,
      claimedBy: assignee?.id ?? null,
      claimedName: assignee?.displayName ?? null,
    });
    if (ticket.number !== number) await channel.setName(ticketChannelName(ticket.number));
  } catch (error) {
    await channel.delete("Ticket could not be recorded").catch(() => null);
    throw error;
  }
  open.set(channel.id, { ticketId: ticket.id, guildId: guild.id, openerId: member.id });
  await recordTicketEvent(ctx.db, {
    ticketId: ticket.id,
    guildId: guild.id,
    text: `${member.displayName} opened this ticket (${topic.label}).${
      ticket.claimedName ? ` Assigned to ${ticket.claimedName}.` : ""
    }`,
  });
  // The one ping a ticket makes: the opener, the staff roles if the server wants them,
  // and the assignee. Everything else Garrison posts is silent.
  const pingRoles = config.pingStaff ? config.staffRoleIds : [];
  await channel.send({
    ...cardMessage(openingCard(ticket, config)),
    allowedMentions: {
      users: [member.id, ...(ticket.claimedBy ? [ticket.claimedBy] : [])],
      roles: pingRoles,
    },
  });
  if (ticket.claimedBy)
    await channel.send({
      content: `<@${ticket.claimedBy}> this one's yours.`,
      allowedMentions: { users: [ticket.claimedBy] },
    });
  return {
    tone: "go",
    title: "Your ticket is open",
    blocks: [{ text: `Head to <#${channel.id}>. Only you and the staff can see it.` }],
    module: "parley",
  };
}

/** A staff member takes a ticket. Taking one from someone else says so. */
export async function claim(
  ctx: BotContext,
  member: GuildMember,
  ticketId: string,
): Promise<{ card: Card; public: boolean }> {
  const ticket = await getTicket(ctx.db, member.guild.id, ticketId);
  if (ticket?.status !== "open")
    return { card: note("This ticket is closed", "Nothing to claim."), public: false };
  const config = await ticketConfig(ctx, member.guild.id);
  if (!isTicketStaff(member, config))
    return {
      card: note("Staff only", "Only the server's ticket staff can claim tickets."),
      public: false,
    };
  if (ticket.claimedBy === member.id)
    return { card: note("It's already yours", "You claimed this ticket.", "volt"), public: false };
  await claimTicket(ctx.db, ticket.id, { id: member.id, name: member.displayName });
  const from = ticket.claimedName ? ` from ${ticket.claimedName}` : "";
  await recordTicketEvent(ctx.db, {
    ticketId: ticket.id,
    guildId: ticket.guildId,
    text: `${member.displayName} claimed this ticket${from}.`,
  });
  return {
    card: {
      tone: "go",
      title: `${safeText(member.displayName)} is on it`,
      blocks: [{ text: `<@${member.id}> claimed this ticket${safeText(from)}.` }],
      module: "parley",
    },
    public: true,
  };
}

/** Who may close: the opener, or staff. */
export async function mayClose(ctx: BotContext, member: GuildMember, ticket: Ticket) {
  if (ticket.openerId === member.id) return true;
  return isTicketStaff(member, await ticketConfig(ctx, member.guild.id));
}

/**
 * Close a ticket: record who and why, set when its transcript expires (by the plan
 * now), post a summary to the log channel, then delete the channel after a pause.
 */
export async function closeAndArchive(
  ctx: BotContext,
  guild: Guild,
  ticket: Ticket,
  by: { id: string; name: string },
  reason: string | null,
): Promise<Card> {
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const now = new Date();
  const closed = await closeTicket(ctx.db, {
    id: ticket.id,
    by,
    reason,
    expiresAt: expiresAt(ent, now),
    at: now,
  });
  if (!closed) return note("Already closed", "This ticket was closed a moment ago.", "volt");
  open.delete(ticket.channelId);
  await recordTicketEvent(ctx.db, {
    ticketId: ticket.id,
    guildId: guild.id,
    text: `${by.name} closed this ticket${reason ? `: ${reason}` : "."}`,
  });
  const days = ent["tickets.historyDays"];
  const channel = guild.channels.cache.get(ticket.channelId);
  if (channel?.isSendable())
    await channel
      .send(
        cardMessage({
          tone: "caution",
          title: "Ticket closed",
          lead: `By <@${by.id}>`,
          blocks: [
            {
              text: `${reason ? `**Reason:** ${safeText(reason)}\n` : ""}This channel is deleted in 10 seconds. The transcript stays on the dashboard for ${days} days.`,
            },
          ],
          module: "parley",
          ref: `#${ticket.number}`,
        }),
      )
      .catch(() => null);
  await postSummary(ctx, guild, closed);
  setTimeout(() => {
    void deleteTicketChannel(ctx, guild, closed);
  }, CLOSE_DELAY_MS);
  return {
    tone: "go",
    title: `Ticket #${ticket.number} closed`,
    blocks: [{ text: `The transcript is kept ${days} days on the dashboard.` }],
    module: "parley",
  };
}

async function postSummary(ctx: BotContext, guild: Guild, t: Ticket) {
  const config = await ticketConfig(ctx, guild.id);
  if (!config.logChannelId) return;
  const channel = guild.channels.cache.get(config.logChannelId);
  if (!channel?.isSendable()) return;
  const minutes = Math.round(
    ((t.closedAt ?? new Date()).getTime() - t.openedAt.getTime()) / 60_000,
  );
  const span = minutes < 90 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  await channel
    .send(
      cardMessage({
        tone: "volt",
        title: `Ticket #${t.number} closed`,
        lead: safeText(t.topicLabel),
        facts: [
          { label: "Opened by", value: `<@${t.openerId}>` },
          { label: "Claimed by", value: t.claimedBy ? `<@${t.claimedBy}>` : "Nobody" },
          { label: "Closed by", value: t.closedBy ? `<@${t.closedBy}>` : "" },
          { label: "Reason", value: t.closeReason ? safeText(t.closeReason) : "" },
          { label: "Messages", value: String(t.messageCount) },
          { label: "Open for", value: span },
        ],
        module: "parley",
        ref: `#${t.number}`,
        at: t.closedAt ?? undefined,
      }),
    )
    .catch((error: unknown) =>
      ctx.logger.warn("Could not post a ticket summary", { guildId: guild.id, error }),
    );
}

async function deleteTicketChannel(
  ctx: BotContext,
  guild: Guild,
  t: Pick<Ticket, "id" | "channelId">,
) {
  const channel = guild.channels.cache.get(t.channelId);
  try {
    if (channel) await channel.delete("Ticket closed");
    await markTicketChannelGone(ctx.db, t.id, t.channelId);
  } catch (error) {
    // Left for the sweep to retry (Garrison may have lost Manage Channels).
    ctx.logger.warn("Could not delete a closed ticket's channel", { guildId: guild.id, error });
  }
}

/** A ticket's channel was deleted by hand while open: close the ticket with it. */
export async function onTicketChannelDeleted(ctx: BotContext, guild: Guild, channelId: string) {
  const t = open.get(channelId);
  if (!t) return;
  const ticket = await getTicket(ctx.db, guild.id, t.ticketId);
  if (!ticket) return;
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const closed = await closeTicket(ctx.db, {
    id: ticket.id,
    by: { id: guild.client.user.id, name: "Garrison" },
    reason: "The channel was deleted",
    expiresAt: expiresAt(ent, new Date()),
  });
  open.delete(channelId);
  if (closed) {
    await markTicketChannelGone(ctx.db, ticket.id, channelId);
    await recordTicketEvent(ctx.db, {
      ticketId: ticket.id,
      guildId: guild.id,
      text: "The channel was deleted, so the ticket was closed.",
    });
    await postSummary(ctx, guild, closed);
  }
}

const attachmentsOf = (list: Collection<string, Attachment>): TicketAttachment[] =>
  [...list.values()].slice(0, 10).map((a) => ({ name: a.name.slice(0, 200), url: a.url }));

/** Record a message written in an open ticket. Bots' messages aren't recorded. */
export async function onTicketMessage(ctx: BotContext, message: Message) {
  if (!message.inGuild() || message.author.bot || message.system) return;
  const t = open.get(message.channelId);
  if (!t) return;
  const member = message.member ?? (await message.guild.members.fetch(message.author.id));
  const staff =
    member.id !== t.openerId && isTicketStaff(member, await ticketConfig(ctx, t.guildId));
  await recordTicketMessage(ctx.db, {
    ticketId: t.ticketId,
    guildId: t.guildId,
    discordMessageId: message.id,
    authorId: message.author.id,
    authorName: member.displayName,
    staff,
    content: message.content,
    attachments: attachmentsOf(message.attachments),
    createdAt: message.createdAt,
  });
}

/** An edit in an open ticket: the transcript keeps the latest text. */
export async function onTicketEdit(ctx: BotContext, message: Message | PartialMessage) {
  if (!open.has(message.channelId)) return;
  const full = message.partial ? await message.fetch().catch(() => null) : message;
  if (!full || full.author.bot) return;
  await editTicketMessage(ctx.db, full.id, {
    content: full.content,
    attachments: attachmentsOf(full.attachments),
    at: full.editedAt ?? new Date(),
  });
}

/** A deletion in an open ticket: kept in the transcript, marked deleted. */
export async function onTicketDelete(ctx: BotContext, message: Message | PartialMessage) {
  if (!open.has(message.channelId)) return;
  await markTicketMessageDeleted(ctx.db, message.id);
}

let lastPrune = 0;
const PRUNE_EVERY_MS = 60 * 60_000;

/** The minute sweep: delete channels a restart left behind, and expired tickets hourly. */
export async function sweepTickets(ctx: BotContext, client: Client<true>, now = new Date()) {
  for (const t of await listClosedTicketChannels(ctx.db, new Date(now.getTime() - 60_000))) {
    const guild = client.guilds.cache.get(t.guildId);
    if (guild) await deleteTicketChannel(ctx, guild, t);
  }
  if (now.getTime() - lastPrune > PRUNE_EVERY_MS) {
    lastPrune = now.getTime();
    const removed = await pruneTickets(ctx.db, now);
    if (removed) ctx.logger.info("Expired tickets removed", { removed });
  }
}
