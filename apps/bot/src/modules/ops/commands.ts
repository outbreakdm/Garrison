import {
  cancelOpsEvent,
  countScheduledOps,
  createOpsEvent,
  getOpsEvent,
  getOpsTimezone,
  listRosterTeams,
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
import { guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command, ModalHandler } from "../../commands/types.js";
import { cardEdit, cardReply, notice, ts } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { slash } from "../../lib/slash.js";
import { safeText } from "../../lib/text.js";
import { parseSlots } from "../rally/parse.js";
import { answerButton } from "./answers.js";
import { OPS_PREFIX } from "./card.js";
import { announcePromotion, raidCard, refreshOpsCard } from "./service.js";
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
        )
        .addStringOption((o) =>
          o
            .setName("style")
            .setDescription("How people sign up (default: Simple)")
            .addChoices(
              { name: "Simple: first come, first served by role", value: "simple" },
              { name: "Organized: members answer, officers pick the lineup", value: "organized" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("team")
            .setDescription("Organized: the roster team it's for")
            .setAutocomplete(true),
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
  async autocomplete(interaction, ctx) {
    const typed = interaction.options.getFocused().toLowerCase();
    const teams = await listRosterTeams(ctx.db, interaction.guildId);
    await interaction.respond(
      teams
        .filter((t) => t.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((t) => ({ name: t.name, value: t.id })),
    );
  },
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);
    const sub = interaction.options.getSubcommand();

    if (sub === "timezone") {
      const tz = parseTimeZone(interaction.options.getString("name", true), "UTC");
      if (!tz.ok) {
        await interaction.reply(notice(tz.error, "alert"));
        return;
      }
      await setOpsTimezone(ctx.db, guild.id, tz.value);
      await interaction.reply(
        notice(`Saved. Raids use ${tz.value} unless you say otherwise.`, "go"),
      );
      return;
    }

    if (sub === "list") {
      const events = await listUpcomingOps(ctx.db, guild.id);
      if (!events.length) {
        await interaction.reply(
          notice(`No raids scheduled. Create one with ${slash("raid create")}.`, "intel"),
        );
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
      await interaction.reply(notice("I can't post in this channel.", "alert"));
      return;
    }
    const tz = parseTimeZone(
      interaction.options.getString("timezone"),
      await getOpsTimezone(ctx.db, guild.id),
    );
    if (!tz.ok) {
      await interaction.reply(notice(tz.error, "alert"));
      return;
    }
    const when = parseWhen(interaction.options.getString("when", true), tz.value);
    if (!when.ok) {
      await interaction.reply(notice(when.error, "alert"));
      return;
    }
    const slots = parseSlots(interaction.options.getString("roles", true), null);
    if (!slots.ok) {
      await interaction.reply(notice(slots.error, "alert"));
      return;
    }
    if ((await countScheduledOps(ctx.db, guild.id)) >= MAX_SCHEDULED) {
      await interaction.reply(
        notice(
          `This server has ${MAX_SCHEDULED} raids scheduled, the most I hold. Cancel one first.`,
          "caution",
        ),
      );
      return;
    }
    // A team makes it organized: its members answer, and officers pick the lineup.
    const askedTeam = interaction.options.getString("team");
    const teams = askedTeam ? await listRosterTeams(ctx.db, guild.id) : [];
    const team =
      teams.find((t) => t.id === askedTeam) ??
      teams.find((t) => t.name.toLowerCase() === askedTeam?.toLowerCase()) ??
      null;
    if (askedTeam && !team) {
      await interaction.reply(notice("There's no roster team by that name.", "intel"));
      return;
    }
    const style =
      team || interaction.options.getString("style") === "organized" ? "organized" : "simple";

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
      style,
      teamId: team?.id ?? null,
    });
    if (!event) {
      await interaction.reply(notice("I couldn't schedule that. Try again.", "alert"));
      return;
    }
    const response = await interaction.reply({
      ...cardReply(await raidCard(ctx, event, []), { ephemeral: false }),
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

    if (action === "avail") return answerButton(interaction, ctx, eventId, index ?? "");

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
      await interaction.reply(notice("That raid is gone.", "alert"));
      return;
    }

    if (action === "cancel") {
      const canManage = interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents);
      if (interaction.user.id !== event.hostId && !canManage) {
        await interaction.reply(
          notice("Only the host or someone with Manage Events can cancel this raid.", "alert"),
        );
        return;
      }
      const cancelled = await cancelOpsEvent(ctx.db, event.id);
      await interaction.update(
        cardEdit(interaction.message, await raidCard(ctx, cancelled ?? event)),
      );
      return;
    }

    if (action === "withdraw") {
      const result = await withdraw(ctx.db, event.id, interaction.user.id);
      if (!result.ok) {
        await interaction.reply(
          notice(
            result.reason === "not_signed_up" ? "You're not signed up." : "This raid is closed.",
            "alert",
          ),
        );
        return;
      }
      await interaction.update(
        cardEdit(interaction.message, await raidCard(ctx, result.event, result.signups)),
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
      await interaction.reply(notice("That raid is gone.", "alert"));
      return;
    }
    const spec = interaction.fields.getTextInputValue("spec").trim();
    if (!SPEC.test(spec)) {
      await interaction.reply(
        notice("Use letters and numbers for your class or spec, up to 20 characters.", "caution"),
      );
      return;
    }

    const result = await signUp(ctx.db, event.id, interaction.user.id, group.name, spec || null);
    if (!result.ok) {
      const msg = {
        not_found: "That raid is gone.",
        closed: "This raid is closed.",
        no_such_role: "That role doesn't exist anymore.",
        unchanged: "You're already signed up like that.",
      }[result.reason];
      await interaction.reply(notice(msg, "intel"));
      return;
    }
    await refreshOpsCard(ctx, interaction.guild, result.event, result.signups);
    const text =
      result.benched === "role_full"
        ? `${group.name} is full, so you're on the bench. You'll move up when a spot opens.`
        : `Signed up as ${group.name}.`;
    await interaction.reply(notice(text, "intel"));
  },
};
