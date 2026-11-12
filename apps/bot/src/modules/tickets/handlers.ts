import { getTicket, recordTicketEvent, TICKET_LIMITS } from "@garrison/db";
import { MessageFlags } from "discord.js";
import { guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command, ModalHandler } from "../../commands/types.js";
import { type Card, cardMessage, cardReply } from "../../lib/card.js";
import { closeForm, isTicketStaff, parseTicketId, TICKET_PREFIX, ticketForm } from "./panel.js";
import {
  checkStart,
  claim,
  closeAndArchive,
  createTicket,
  mayClose,
  ticketConfig,
  ticketInChannel,
} from "./service.js";

/** Ticket buttons, forms and /ticket. Answers are private unless they belong in the channel. */

const ephemeral = { flags: MessageFlags.Ephemeral } as const;
const note = (title: string, text: string): Card => ({
  tone: "caution",
  title,
  blocks: [{ text }],
  module: "parley",
});

export const ticketButtons: ButtonHandler = {
  prefix: TICKET_PREFIX,
  async execute(interaction, ctx) {
    const press = parseTicketId(interaction.customId);
    if (!press) return;
    if (press.kind === "open") {
      const check = await checkStart(ctx, interaction.member, press.panelId, press.topicId);
      if (!check.ok) {
        await interaction.reply(cardReply(check.card));
        return;
      }
      const { start } = check;
      if (start.questions.length) {
        await interaction.showModal(ticketForm(start.panel.id, start.topic, start.questions));
        return;
      }
      await interaction.deferReply(ephemeral);
      await interaction.editReply(
        cardMessage(await createTicket(ctx, interaction.member, start, [])),
      );
      return;
    }
    if (press.kind === "claim") {
      const result = await claim(ctx, interaction.member, press.ticketId);
      await interaction.reply(cardReply(result.card, { ephemeral: !result.public }));
      return;
    }
    if (press.kind === "close") {
      const ticket = await getTicket(ctx.db, interaction.guildId, press.ticketId);
      if (ticket?.status !== "open") {
        await interaction.reply(cardReply(note("Already closed", "This ticket is closed.")));
        return;
      }
      if (!(await mayClose(ctx, interaction.member, ticket))) {
        await interaction.reply(
          cardReply(
            note("Not yours to close", "The member who opened it, or staff, can close it."),
          ),
        );
        return;
      }
      await interaction.showModal(closeForm(ticket.id));
    }
  },
};

export const ticketModals: ModalHandler = {
  prefix: TICKET_PREFIX,
  async execute(interaction, ctx) {
    const press = parseTicketId(interaction.customId);
    if (!press) return;
    if (press.kind === "form") {
      // Checked again: the setup or the member's open tickets may have changed meanwhile.
      const check = await checkStart(ctx, interaction.member, press.panelId, press.topicId);
      if (!check.ok) {
        await interaction.reply(cardReply(check.card));
        return;
      }
      const answers = check.start.questions.map((question, i) => ({
        question,
        answer: (interaction.fields.getTextInputValue(`q${i}`) ?? "")
          .trim()
          .slice(0, TICKET_LIMITS.answer),
      }));
      await interaction.deferReply(ephemeral);
      await interaction.editReply(
        cardMessage(await createTicket(ctx, interaction.member, check.start, answers)),
      );
      return;
    }
    if (press.kind === "reason") {
      const ticket = await getTicket(ctx.db, interaction.guildId, press.ticketId);
      if (ticket?.status !== "open") {
        await interaction.reply(cardReply(note("Already closed", "This ticket is closed.")));
        return;
      }
      if (!(await mayClose(ctx, interaction.member, ticket))) {
        await interaction.reply(cardReply(note("Not yours to close", "Ask the staff.")));
        return;
      }
      const reason =
        interaction.fields.getTextInputValue("reason")?.trim().slice(0, TICKET_LIMITS.reason) ||
        null;
      await interaction.deferReply(ephemeral);
      const card = await closeAndArchive(
        ctx,
        interaction.guild,
        ticket,
        { id: interaction.user.id, name: interaction.member.displayName },
        reason,
      );
      await interaction.editReply(cardMessage(card)).catch(() => null);
    }
  },
};

export const ticket: Command = {
  data: guildCommand("ticket", "Work on the ticket in this channel.", null)
    .addSubcommand((s) =>
      s
        .setName("close")
        .setDescription("Close this ticket (the member who opened it, or staff)")
        .addStringOption((o) =>
          o.setName("reason").setDescription("Kept with the transcript").setMaxLength(300),
        ),
    )
    .addSubcommand((s) => s.setName("claim").setDescription("Take this ticket (staff)"))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Let someone else see and write in this ticket (staff)")
        .addUserOption((o) => o.setName("member").setDescription("Who to add").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Take someone you added out of this ticket (staff)")
        .addUserOption((o) =>
          o.setName("member").setDescription("Who to remove").setRequired(true),
        ),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const open = ticketInChannel(interaction.channelId);
    const t = open ? await getTicket(ctx.db, interaction.guildId, open.ticketId) : null;
    if (t?.status !== "open") {
      await interaction.reply(
        cardReply(note("Not a ticket", "Use /ticket inside an open ticket's channel.")),
      );
      return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "close") {
      if (!(await mayClose(ctx, interaction.member, t))) {
        await interaction.reply(cardReply(note("Not yours to close", "Ask the staff.")));
        return;
      }
      await interaction.deferReply(ephemeral);
      const reason = interaction.options.getString("reason")?.trim() || null;
      const card = await closeAndArchive(
        ctx,
        interaction.guild,
        t,
        { id: interaction.user.id, name: interaction.member.displayName },
        reason,
      );
      await interaction.editReply(cardMessage(card)).catch(() => null);
      return;
    }
    if (sub === "claim") {
      const result = await claim(ctx, interaction.member, t.id);
      await interaction.reply(cardReply(result.card, { ephemeral: !result.public }));
      return;
    }
    const config = await ticketConfig(ctx, interaction.guildId);
    if (!isTicketStaff(interaction.member, config)) {
      await interaction.reply(cardReply(note("Staff only", "Ask the staff to add someone.")));
      return;
    }
    const user = interaction.options.getUser("member", true);
    const channel = interaction.channel;
    if (!channel || channel.isThread() || !("permissionOverwrites" in channel)) return;
    if (sub === "add") {
      if (user.bot) {
        await interaction.reply(cardReply(note("That's a bot", "Add members, not bots.")));
        return;
      }
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await recordTicketEvent(ctx.db, {
        ticketId: t.id,
        guildId: t.guildId,
        text: `${interaction.member.displayName} added ${user.username}.`,
      });
      await interaction.reply(
        cardReply(
          {
            tone: "go",
            title: "Added",
            blocks: [{ text: `<@${user.id}> can now see and write in this ticket.` }],
            module: "parley",
          },
          { ephemeral: false },
        ),
      );
      return;
    }
    if (user.id === t.openerId) {
      await interaction.reply(cardReply(note("That's who opened it", "Close the ticket instead.")));
      return;
    }
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (target && isTicketStaff(target, config)) {
      await interaction.reply(
        cardReply(note("That's staff", "Staff see every ticket through their role.")),
      );
      return;
    }
    await channel.permissionOverwrites.delete(user.id);
    await recordTicketEvent(ctx.db, {
      ticketId: t.id,
      guildId: t.guildId,
      text: `${interaction.member.displayName} removed ${user.username}.`,
    });
    await interaction.reply(
      cardReply(
        {
          tone: "volt",
          title: "Removed",
          blocks: [{ text: `<@${user.id}> no longer sees this ticket.` }],
          module: "parley",
        },
        { ephemeral: false },
      ),
    );
  },
};
