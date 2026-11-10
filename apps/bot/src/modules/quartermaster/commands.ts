import {
  getQmBuild,
  getQmBuildByVersion,
  listQmBuilds,
  type QmBuild,
  transitionQmBuild,
} from "@garrison/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command } from "../../commands/types.js";
import { serverUrl } from "../../lib/dashboard.js";
import { brandEmbed, done, failed } from "../../lib/embeds.js";
import { safeText } from "../../lib/text.js";
import { describePlan, type ServerSnapshot } from "./plan.js";
import { applyBuild, PLAN_TTL_MS, planBuild, REQUEST_MAX, undoBuild } from "./service.js";

export const QM_PREFIX = "qm";
const UUID = /^[0-9a-f-]{36}$/;
const NOT_SET_UP = "Quartermaster isn't set up on this Garrison: the bot has no Claude API key.";

const row = (...buttons: (ButtonBuilder | null)[]) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.filter((b) => b !== null));
const button = (id: string, label: string, style: ButtonStyle) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
/** A link to the Quartermaster page, where the plan shows as the server with it slotted in. */
const dashboardLink = (guildId: string, anchor: string, label: string) => {
  const url = serverUrl(guildId, `quartermaster${anchor}`);
  return url ? new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label) : null;
};

function planEmbed(build: QmBuild, server: ServerSnapshot, notes: string) {
  const lines = describePlan(build.plan, server).map((l) => safeText(l));
  const expires = Math.floor((build.createdAt.getTime() + PLAN_TTL_MS) / 1000);
  return brandEmbed({
    title: `Plan v${build.version}: ${safeText(build.summary)}`,
    description: [
      `\`\`\`diff\n${lines.join("\n").replaceAll("```", "'''")}\n\`\`\``,
      notes ? `**Left out:** ${safeText(notes)}` : null,
      `New roles get no permissions, and nothing you already have is changed. Nothing is built until you press Apply. This plan expires <t:${expires}:R>.`,
    ]
      .filter(Boolean)
      .join("\n"),
    module: "quartermaster",
    ref: `plan v${build.version} · ${build.plan.length} changes`,
  });
}

export const qm: Command = {
  data: guildCommand(
    "qm",
    "Quartermaster: describe channels and roles, review the plan, then build it.",
    PermissionFlagsBits.ManageGuild,
  )
    .addSubcommand((s) =>
      s
        .setName("build")
        .setDescription("Plan new categories, channels and roles from a description")
        .addStringOption((o) =>
          o
            .setName("request")
            .setDescription(
              'e.g. "A WARDOGS section with ranked and casual LFG, a voice room, and a Gold+ role for ranked"',
            )
            .setRequired(true)
            .setMaxLength(REQUEST_MAX),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("undo")
        .setDescription("Remove everything a build created")
        .addIntegerOption((o) =>
          o
            .setName("version")
            .setDescription("Build version, e.g. 14")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((s) => s.setName("history").setDescription("Recent builds"))
    .toJSON(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();

    if (sub === "history") {
      const builds = await listQmBuilds(ctx.db, guild.id, 10);
      const lines = builds.map(
        (b) =>
          `\`v${b.version}\` ${safeText(b.summary)} · ${b.status.replace("_", " ")} · ${b.created.length} created · <@${b.requestedById}> <t:${Math.floor(b.createdAt.getTime() / 1000)}:R>`,
      );
      await interaction.reply({
        embeds: [
          brandEmbed({
            title: "Quartermaster builds",
            description: lines.join("\n") || "No builds yet.",
            module: "quartermaster",
          }),
        ],
        components: [row(dashboardLink(guild.id, "", "Open in dashboard"))].filter(
          (r) => r.components.length,
        ),
        ...ephemeral,
      });
      return;
    }

    if (sub === "undo") {
      const build = await getQmBuildByVersion(
        ctx.db,
        guild.id,
        interaction.options.getInteger("version", true),
      );
      if (!build || (build.status !== "applied" && build.status !== "failed")) {
        await interaction.reply({
          ...failed("There's no applied build with that version."),
          ...ephemeral,
        });
        return;
      }
      const channels = build.created.filter((c) => c.kind !== "role").length;
      const roles = build.created.filter((c) => c.kind === "role").length;
      // Deleting channels takes their messages with them: a red "are you sure?".
      await interaction.reply({
        embeds: [
          brandEmbed({
            kind: "danger",
            title: `Undo v${build.version}?`,
            description: `This deletes the ${channels} channels and categories and ${roles} roles that build created, with any messages posted in those channels since. Nothing else is touched.`,
            module: "quartermaster",
            ref: `v${build.version}`,
          }),
        ],
        components: [
          row(
            button(`${QM_PREFIX}:undo:${build.id}`, `Undo v${build.version}`, ButtonStyle.Danger),
          ),
        ],
        ...ephemeral,
      });
      return;
    }

    if (!ctx.planner) {
      await interaction.reply({ ...failed(NOT_SET_UP), ...ephemeral });
      return;
    }
    const request = interaction.options.getString("request", true).trim();
    await interaction.deferReply(ephemeral);
    const outcome = await planBuild(
      ctx,
      ctx.planner,
      guild,
      { id: interaction.user.id, tag: interaction.user.username },
      request,
    );
    if (!outcome.ok) {
      await interaction.editReply(failed(outcome.error));
      return;
    }
    await interaction.editReply({
      embeds: [planEmbed(outcome.build, outcome.server, outcome.notes)],
      components: [
        row(
          button(
            `${QM_PREFIX}:apply:${outcome.build.id}`,
            `Apply v${outcome.build.version}`,
            ButtonStyle.Primary,
          ),
          button(`${QM_PREFIX}:cancel:${outcome.build.id}`, "Cancel", ButtonStyle.Secondary),
          dashboardLink(guild.id, "#plan", "See it on the dashboard"),
        ),
      ],
    });
  },
};

export const qmButtons: ButtonHandler = {
  prefix: QM_PREFIX,
  async execute(interaction, ctx) {
    const [, action, id] = interaction.customId.split(":");
    if (!id || !UUID.test(id)) return;
    // Re-checked on every click: the message may outlive someone's permissions.
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ ...failed("You need Manage Server to do that."), ...ephemeral });
      return;
    }
    const build = await getQmBuild(ctx.db, interaction.guild.id, id);
    if (!build) {
      await interaction.reply({ ...failed("That build doesn't exist."), ...ephemeral });
      return;
    }

    if (action === "cancel") {
      const cancelled = await transitionQmBuild(ctx.db, build.id, "pending", "cancelled");
      await interaction.update({
        ...(cancelled
          ? done(`Discarded plan v${build.version}. Nothing was changed.`)
          : failed("That plan isn't waiting any more.")),
        components: [],
      });
      return;
    }

    if (action === "apply") {
      if (interaction.user.id !== build.requestedById) {
        await interaction.reply({
          ...failed("Only the person who asked for this plan can apply it."),
          ...ephemeral,
        });
        return;
      }
      await interaction.deferUpdate();
      const result = await applyBuild(ctx, interaction.guild, build);
      if (!result.ok) {
        await interaction.editReply({ ...failed(result.error), components: [] });
        return;
      }
      const lines = result.created.map((c) =>
        c.kind === "role"
          ? `@${safeText(c.name)}`
          : c.kind === "category"
            ? safeText(c.name)
            : `<#${c.id}>`,
      );
      await interaction.editReply({
        content: "",
        embeds: [
          brandEmbed({
            // Stopping partway leaves the server half-built: that's an error.
            kind: result.failed ? "danger" : "done",
            title: result.failed
              ? `v${build.version} stopped partway`
              : `Built v${build.version}: ${result.created.length} ${result.created.length === 1 ? "change" : "changes"}`,
            description: [
              result.failed,
              lines.length ? `**Created:** ${lines.join(" · ")}` : null,
              result.failed ? "Undo removes what was created." : null,
            ]
              .filter(Boolean)
              .join("\n"),
            module: "quartermaster",
            ref: `v${build.version}`,
          }),
        ],
        components: [
          row(
            button(
              `${QM_PREFIX}:undo:${build.id}`,
              `Undo v${build.version}`,
              ButtonStyle.Secondary,
            ),
            dashboardLink(interaction.guild.id, `#build-${build.version}`, "Open in dashboard"),
          ),
        ],
      });
      return;
    }

    if (action === "undo") {
      await interaction.deferReply(ephemeral);
      const result = await undoBuild(ctx, interaction.guild, build, interaction.user.id);
      if (!result.ok) {
        await interaction.editReply(failed(result.error));
        return;
      }
      const extra = [
        result.missing ? `${result.missing} were already gone` : null,
        result.failed ? `${result.failed} couldn't be removed: check my role position` : null,
      ].filter(Boolean);
      const text = `Undid v${build.version}. Removed ${result.removed}.${extra.length ? ` ${extra.join("; ")}.` : ""}`;
      // Anything left behind needs someone's attention, so that isn't a green tick.
      await interaction.editReply(result.failed ? failed(text) : done(text));
    }
  },
};
