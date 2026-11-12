import {
  type Entitlements,
  isTopicPaused,
  type Ticket,
  type TicketConfig,
  type TicketPanel,
  type TicketTopic,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
  type MessageActionRowComponentBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { type Card, customCardMessage } from "../../lib/card.js";
import { componentEmoji } from "../../lib/emoji.js";
import { safeText } from "../../lib/text.js";

/**
 * How tickets look in Discord. Custom IDs carry the panel and topic IDs (opening)
 * or the ticket's ID (claiming, closing), so every press is checked against what's
 * saved now, never against what the posted message says.
 */

export const TICKET_PREFIX = "tk";
const ID = "[a-z0-9]{6,16}";
const UUID = "[0-9a-f-]{36}";

export const openId = (panelId: string, topicId: string) => `tk:o:${panelId}:${topicId}`;
export const formId = (panelId: string, topicId: string) => `tk:f:${panelId}:${topicId}`;
export const claimId = (ticketId: string) => `tk:c:${ticketId}`;
export const closeId = (ticketId: string) => `tk:x:${ticketId}`;
export const reasonId = (ticketId: string) => `tk:r:${ticketId}`;

export type TicketPress =
  | { kind: "open" | "form"; panelId: string; topicId: string }
  | { kind: "claim" | "close" | "reason"; ticketId: string };

export function parseTicketId(customId: string): TicketPress | null {
  const topic = new RegExp(`^tk:([of]):(${ID}):(${ID})$`).exec(customId);
  if (topic?.[2] && topic[3])
    return { kind: topic[1] === "o" ? "open" : "form", panelId: topic[2], topicId: topic[3] };
  const ticket = new RegExp(`^tk:([cxr]):(${UUID})$`).exec(customId);
  if (ticket?.[2])
    return {
      kind: ticket[1] === "c" ? "claim" : ticket[1] === "x" ? "close" : "reason",
      ticketId: ticket[2],
    };
  return null;
}

/** The panel's buttons: one per topic this plan runs, five to a row. */
export function panelRows(
  panel: TicketPanel,
  ent: Entitlements,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const topics = panel.topics.filter((_, i) => !isTopicPaused(i, ent));
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (let i = 0; i < topics.length; i += 5) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        topics.slice(i, i + 5).map((t) => {
          const button = new ButtonBuilder()
            .setCustomId(openId(panel.id, t.id))
            .setLabel(t.label)
            .setStyle(ButtonStyle.Secondary);
          const emoji = t.emoji ? componentEmoji(t.emoji) : null;
          if (emoji) button.setEmoji(emoji);
          return button;
        }),
      ),
    );
  }
  return rows;
}

export const panelMessage = (panel: TicketPanel, ent: Entitlements) =>
  customCardMessage(panel.card, ent, panelRows(panel, ent));

/** The form a topic asks before its ticket opens (Pro). Discord allows 5 questions. */
export function ticketForm(panelId: string, topic: TicketTopic, questions: string[]) {
  return new ModalBuilder()
    .setCustomId(formId(panelId, topic.id))
    .setTitle(topic.label.slice(0, 45))
    .addComponents(
      questions
        .slice(0, 5)
        .map((q, i) =>
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(`q${i}`)
              .setLabel(q.slice(0, 45))
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(1000)
              .setRequired(true),
          ),
        ),
    );
}

/** Asks why a ticket is being closed. The reason is optional. */
export function closeForm(ticketId: string) {
  return new ModalBuilder()
    .setCustomId(reasonId(ticketId))
    .setTitle("Close this ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason (optional, kept with the transcript)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(300)
          .setRequired(false),
      ),
    );
}

/** Staff answer tickets: anyone with a staff role, or Manage Server. */
export function isTicketStaff(member: GuildMember, config: Pick<TicketConfig, "staffRoleIds">) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return config.staffRoleIds.some((id) => member.roles.cache.has(id));
}

/** The first card in a ticket's channel: who opened it, their answers, and the buttons. */
export function openingCard(ticket: Ticket, config: Pick<TicketConfig, "staffRoleIds">): Card {
  const staff = config.staffRoleIds.map((id) => `<@&${id}>`).join(" ");
  const blocks: Card["blocks"] = [
    {
      text: `Tell us what's going on and ${staff || "the staff"} will answer here. Only you and the staff can see this channel.`,
    },
  ];
  if (ticket.answers.length) {
    blocks.push("divider");
    for (const a of ticket.answers)
      blocks.push({ text: `**${safeText(a.question)}**\n${safeText(a.answer)}` });
  }
  return {
    tone: "intel",
    title: `Ticket #${ticket.number} · ${safeText(ticket.topicLabel)}`,
    status: ticket.claimedBy ? `Claimed by ${safeText(ticket.claimedName ?? "staff")}` : "Open",
    lead: `Opened by <@${ticket.openerId}>`,
    blocks,
    actions: [
      new ButtonBuilder()
        .setCustomId(claimId(ticket.id))
        .setLabel("Claim")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(closeId(ticket.id))
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger),
    ],
    module: "parley",
    ref: `#${ticket.number}`,
    at: ticket.openedAt,
  };
}
