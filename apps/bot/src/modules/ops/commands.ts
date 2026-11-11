import {
  cancelOpsEvent,
  countScheduledOps,
  createOpsEvent,
  getOpsEvent,
  getOpsTimezone,
  listSignups,
  listUpcomingOps,
  setOpsMessage,
  setOpsTimezone,
  signUp,
  withdraw,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command, ModalHandler } from "../../commands/types.js";
import { cardEdit, cardReply, ts } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { parseSlots } from "../rally/parse.js";
import { OPS_PREFIX, opsCard } from "./card.js";
import { announcePromotion, refreshOpsCard } from "./service.js";
import { parseTimeZone, parseWhen } from "./when.js";

/** Scheduled events per server. Raids are planned weeks ahead; this caps abuse, not use. */
export const MAX_SCHEDULED = 25;
const SPEC = /^[\p{L}\p{N} +'/-]{0,20}$/u;
const UUID = /^[0-9a-f-]{36}$/;

export const raid: Command = {
  data: guildCommand(
    "raid",
    "Schedule raids and events with role signups and a bench.",
    PermissionFlagsBits.ManageEvents,
  )
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Post a raid in this channel")
        .addStringOption((o) =>
          o
            .setName("title")
            .setDescription('e.g. "Molten Core"')
            .setRequired(true)
            .setMaxLength(80),
        )
        .addStringOption((o) =>
          o
            .setName("when")
            .setDescription('"2026-11-12 20:00", "2026-11-12 8pm", or a time from now like 2d')
            .setRequired(true)
            .setMaxLength(32),
        )
        .addStringOption((o) =>
          o
            .setName("roles")
            .setDescription('Caps by role, e.g. "Tank 4, Healer 8, DPS 28"')
            .setRequired(true)
            .setMaxLength(120),
        )
        .addStringOption((o) =>
          o
            .setName("timezone")
            .setDescription("e.g. America/Chicago. Default: the server's")
            .setMaxLength(64),
        )
        .addBooleanOption((o) =>
          o.setName("repeat_weekly").setDescription("Post it again every week"),
        )
        .addStringOption((o) =>
          o.setName("note").setDescription("Requirements or details").setMaxLength(200),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Show upcoming raids"))
    .addSubcommand((s) =>
      s
        .setName("timezone")
        .setDescription("Set the server's default time zone for raids")
        .addStringOption((o) =>
          o
            .setName("name")
            .setDescription("e.g. America/Chicago")
            .setRequired(true)
            .setMaxLength(64),
        ),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);
    const sub = interaction.options.getSubcommand();

    if (sub === "timezone") {
      const tz = parseTimeZone(interaction.options.getString("name", true), "UTC");
      if (!tz.ok) {
        await interaction.reply({ content: tz.error, ...ephemeral });
        return;
      }
      await setOpsTimezone(ctx.db, guild.id, tz.value);
      await interaction.reply({
        content: `Saved. Raids use ${tz.value} unless you say otherwise.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const events = await listUpcomingOps(ctx.db, guild.id);
      if (!events.length) {
        await interaction.reply({
          content: "No raids scheduled. Create one with `/raid create`.",
          ...ephemeral,
        });
        return;
      }
      const lines = events.slice(0, 15).map((e) => {
        const link = e.messageId
          ? `https://discord.com/channels/${guild.id}/${e.channelId}/${e.messageId}`
          : `<#${e.channelId}>`;
        return `- [${safeText(e.title)}](${link}) · ${ts(e.startsAt, "F")}${e.repeatWeekly ? " · weekly" : ""}`;
      });
      await interaction.reply(
        cardReply({
          title: `${events.length} upcoming ${events.length === 1 ? "raid" : "raids"}`,
          blocks: [{ text: lines.join("\n") }],
          module: "ops",
          ref: events.length > 15 ? "first 15" : undefined,
        }),
      );
      return;
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({ content: "I can't post in this channel.", ...ephemeral });
      return;
    }
    const tz = parseTimeZone(
      interaction.options.getString("timezone"),
      await getOpsTimezone(ctx.db, guild.id),
    );
    if (!tz.ok) {
      await interaction.reply({ content: tz.error, ...ephemeral });
      return;
    }
    const when = parseWhen(interaction.options.getString("when", true), tz.value);
    if (!when.ok) {
      await interaction.reply({ content: when.error, ...ephemeral });
      return;
    }
    const slots = parseSlots(interaction.options.getString("roles", true), null);
    if (!slots.ok) {
      await interaction.reply({ content: slots.error, ...ephemeral });
      return;
    }
    if ((await countScheduledOps(ctx.db, guild.id)) >= MAX_SCHEDULED) {
      await interaction.reply({
        content: `This server has ${MAX_SCHEDULED} raids scheduled, the most I hold. Cancel one first.`,
        ...ephemeral,
      });
      return;
    }

    const event = await createOpsEvent(ctx.db, {
      guildId: guild.id,
      channelId: channel.id,
      hostId: interaction.user.id,
      title: interaction.options.getString("title", true).trim(),
      note: interaction.options.getString("note")?.trim() || null,
      slots: slots.value,
      startsAt: when.value,
      timezone: tz.value,
      repeatWeekly: interaction.options.getBoolean("repeat_weekly") ?? false,
    });
    if (!event) {
      await interaction.reply({ content: "I couldn't schedule that. Try again.", ...ephemeral });
      return;
    }
    const response = await interaction.reply({
      ...cardReply(opsCard(event, []), { ephemeral: false }),
      withResponse: true,
    });
    const sent = response.resource?.message;
    if (sent) await setOpsMessage(ctx.db, event.id, sent.id);
  },
};

export const opsButtons: ButtonHandler = {
  prefix: OPS_PREFIX,
  async execute(interaction, ctx) {
    const [, action, eventId, index] = interaction.customId.split(":");
    if (!eventId || !UUID.test(eventId)) return;

    if (action === "join") {
      // Ask for an optional class or spec. The signup happens when the form comes back.
      const signups = await listSignups(ctx.db, eventId);
      const mine = signups.find((s) => s.userId === interaction.user.id);
      const input = new TextInputBuilder()
        .setCustomId("spec")
        .setLabel("Class or spec (optional)")
        .setPlaceholder("e.g. Prot, Resto, Mage")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(20);
      if (mine?.spec) input.setValue(mine.spec);
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId(`${OPS_PREFIX}:spec:${eventId}:${index}`)
          .setTitle("Sign up")
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)),
      );
      return;
    }

    const event = await getOpsEvent(ctx.db, interaction.guild.id, eventId);
    if (!event) {
      await interaction.reply({ content: "That raid is gone.", ...ephemeral });
      return;
    }

    if (action === "cancel") {
      const canManage = interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents);
      if (interaction.user.id !== event.hostId && !canManage) {
        await interaction.reply({
          content: "Only the host or someone with Manage Events can cancel this raid.",
          ...ephemeral,
        });
        return;
      }
      const cancelled = await cancelOpsEvent(ctx.db, event.id);
      await interaction.update(
        cardEdit(
          interaction.message,
          opsCard(cancelled ?? event, await listSignups(ctx.db, event.id)),
        ),
      );
      return;
    }

    if (action === "withdraw") {
      const result = await withdraw(ctx.db, event.id, interaction.user.id);
      if (!result.ok) {
        await interaction.reply({
          content:
            result.reason === "not_signed_up" ? "You're not signed up." : "This raid is closed.",
          ...ephemeral,
        });
        return;
      }
      await interaction.update(
        cardEdit(interaction.message, opsCard(result.event, result.signups)),
      );
      if (result.promoted)
        await announcePromotion(interaction.guild, result.event, result.promoted);
    }
  },
};

export const opsModals: ModalHandler = {
  prefix: OPS_PREFIX,
  async execute(interaction, ctx) {
    const [, action, eventId, index] = interaction.customId.split(":");
    if (action !== "spec" || !eventId || !UUID.test(eventId)) return;
    const event = await getOpsEvent(ctx.db, interaction.guild.id, eventId);
    const group = event?.slots[Number(index)];
    if (!event || !group) {
      await interaction.reply({ content: "That raid is gone.", ...ephemeral });
      return;
    }
    const spec = interaction.fields.getTextInputValue("spec").trim();
    if (!SPEC.test(spec)) {
      await interaction.reply({
        content: "Use letters and numbers for your class or spec, up to 20 characters.",
        ...ephemeral,
      });
      return;
    }

    const result = await signUp(ctx.db, event.id, interaction.user.id, group.name, spec || null);
    if (!result.ok) {
      const msg = {
        not_found: "That raid is gone.",
        closed: "This raid is closed.",
        no_such_role: "That role doesn't exist any more.",
        unchanged: "You're already signed up like that.",
      }[result.reason];
      await interaction.reply({ content: msg, ...ephemeral });
      return;
    }
    await refreshOpsCard(ctx, interaction.guild, result.event, result.signups);
    const text =
      result.benched === "role_full"
        ? `${group.name} is full, so you're on the bench. You'll move up when a spot opens.`
        : `Signed up as ${group.name}.`;
    await interaction.reply({ content: text, ...ephemeral });
  },
};
