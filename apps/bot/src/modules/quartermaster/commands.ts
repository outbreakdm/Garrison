import {
  getQmBuild,
  getQmBuildByVersion,
  listQmBuilds,
  type QmBuild,
  transitionQmBuild,
} from "@garrison/db";
import { ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { ButtonHandler, Command } from "../../commands/types.js";
import { type Card, cardEdit, cardMessage, cardReply, ts } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { describePlan, type ServerSnapshot } from "./plan.js";
import { applyBuild, PLAN_TTL_MS, planBuild, REQUEST_MAX, undoBuild } from "./service.js";

export const QM_PREFIX = "qm";
const UUID = /^[0-9a-f-]{36}$/;
const NOT_SET_UP = "Quartermaster isn't set up on this Garrison: the bot has no Claude API key.";

const button = (id: string, label: string, style: ButtonStyle) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

/** The plan to review: the summary, every change as a diff, what was left out, and Apply. */
export function planCard(
  build: QmBuild,
  server: ServerSnapshot,
  notes: string,
  creditsLeft?: number,
): Card {
  const lines = describePlan(build.plan, server).map((l) => safeText(l));
  const expires = new Date(build.createdAt.getTime() + PLAN_TTL_MS);
  return {
    tone: "intel",
    title: `Plan v${build.version}`,
    status: `${build.plan.length} ${build.plan.length === 1 ? "change" : "changes"}`,
    lead: safeText(build.summary),
    blocks: [
      { text: `\`\`\`diff\n${lines.join("\n").replaceAll("```", "'''")}\n\`\`\`` },
      ...(notes ? [{ text: `**Left out:** ${safeText(notes)}` }] : []),
      {
        text: `-# New roles get no permissions. Nothing that exists is changed. Expires ${ts(expires)}.`,
      },
    ],
    actions: [
      button(`${QM_PREFIX}:apply:${build.id}`, `Apply v${build.version}`, ButtonStyle.Primary),
      button(`${QM_PREFIX}:cancel:${build.id}`, "Discard", ButtonStyle.Secondary),
    ],
    module: "quartermaster",
    ref:
      creditsLeft === undefined
        ? `plan v${build.version}`
        : `plan v${build.version} · ${creditsLeft} ${creditsLeft === 1 ? "plan" : "plans"} left today`,
  };
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
          `\`v${b.version}\` **${safeText(b.summary)}** · ${b.status.replace("_", " ")} · ${b.created.length} created · <@${b.requestedById}> ${ts(b.createdAt)}`,
      );
      await interaction.reply(
        cardReply({
          title: "Quartermaster builds",
          lead: lines.length ? undefined : "No builds yet. Describe one with `/qm build`.",
          blocks: lines.length ? [{ text: lines.join("\n") }] : [],
          module: "quartermaster",
          ref: lines.length ? `latest ${lines.length}` : undefined,
        }),
      );
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
          content: "There's no applied build with that version.",
          ...ephemeral,
        });
        return;
      }
      const channels = build.created.filter((c) => c.kind !== "role").length;
      const roles = build.created.filter((c) => c.kind === "role").length;
      await interaction.reply(
        cardReply({
          tone: "caution",
          title: `Undo v${build.version}?`,
          lead: safeText(build.summary),
          blocks: [
            {
              text: `This deletes the ${channels} channels and categories and ${roles} roles it created, including any messages posted in those channels since. Nothing else is touched.`,
              button: button(
                `${QM_PREFIX}:undo:${build.id}`,
                `Undo v${build.version}`,
                ButtonStyle.Danger,
              ),
            },
          ],
          module: "quartermaster",
          ref: `v${build.version}`,
        }),
      );
      return;
    }

    if (!ctx.planner) {
      await interaction.reply({ content: NOT_SET_UP, ...ephemeral });
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
      await interaction.editReply(outcome.error);
      return;
    }
    await interaction.editReply(
      cardMessage(planCard(outcome.build, outcome.server, outcome.notes, outcome.creditsLeft)),
    );
  },
};

export const qmButtons: ButtonHandler = {
  prefix: QM_PREFIX,
  async execute(interaction, ctx) {
    const [, action, id] = interaction.customId.split(":");
    if (!id || !UUID.test(id)) return;
    // Re-checked on every click: the message may outlive someone's permissions.
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need Manage Server to do that.", ...ephemeral });
      return;
    }
    const build = await getQmBuild(ctx.db, interaction.guild.id, id);
    if (!build) {
      await interaction.reply({ content: "That build doesn't exist.", ...ephemeral });
      return;
    }

    if (action === "cancel") {
      const done = await transitionQmBuild(ctx.db, build.id, "pending", "cancelled");
      // The plan message may be an old embed; whichever format it has, it becomes the outcome.
      await interaction.update(
        cardEdit(interaction.message, {
          tone: done ? "intel" : "caution",
          title: done ? `Plan v${build.version} canceled` : `Plan v${build.version}`,
          lead: done ? "Nothing was changed." : "That plan isn't pending anymore.",
          module: "quartermaster",
          ref: `v${build.version}`,
        }),
      );
      return;
    }

    if (action === "apply") {
      if (interaction.user.id !== build.requestedById) {
        await interaction.reply({
          content: "Only the person who asked for this plan can apply it.",
          ...ephemeral,
        });
        return;
      }
      await interaction.deferUpdate();
      const result = await applyBuild(ctx, interaction.guild, build);
      if (!result.ok) {
        await interaction.editReply(
          cardEdit(interaction.message, {
            tone: "alert",
            title: `Couldn't apply v${build.version}`,
            lead: result.error,
            module: "quartermaster",
            ref: `v${build.version}`,
          }),
        );
        return;
      }
      const created = result.created.map((c) =>
        c.kind === "role"
          ? `@${safeText(c.name)}`
          : c.kind === "category"
            ? `**${safeText(c.name)}**`
            : `<#${c.id}>`,
      );
      await interaction.editReply(
        cardEdit(interaction.message, {
          tone: result.failed ? "caution" : "go",
          title: result.failed
            ? `v${build.version} stopped partway`
            : `Applied v${build.version}: ${result.created.length} ${result.created.length === 1 ? "change" : "changes"}`,
          lead: safeText(build.summary),
          blocks: [
            ...(result.failed ? [{ text: result.failed }] : []),
            ...(created.length ? [{ text: created.join(" · ") }] : []),
            {
              text: "-# Undo removes exactly what this build created, and nothing else.",
              button: button(
                `${QM_PREFIX}:undo:${build.id}`,
                `Undo v${build.version}`,
                ButtonStyle.Secondary,
              ),
            },
          ],
          module: "quartermaster",
          ref: `v${build.version}`,
        }),
      );
      return;
    }

    if (action === "undo") {
      await interaction.deferReply(ephemeral);
      const result = await undoBuild(ctx, interaction.guild, build, interaction.user.id);
      if (!result.ok) {
        await interaction.editReply(result.error);
        return;
      }
      const extra = [
        result.missing ? `${result.missing} were already gone` : null,
        result.failed ? `${result.failed} couldn't be removed: check my role position` : null,
      ].filter(Boolean);
      await interaction.editReply(
        `Undone v${build.version}. Removed ${result.removed}.${extra.length ? ` ${extra.join("; ")}.` : ""}`,
      );
    }
  },
};
