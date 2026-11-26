import {
  ACCESS_AREAS,
  ACCESS_SWITCHES,
  type AccessArea,
  getDashboardAccess,
  resolveAccess,
} from "@garrison/db";
import { ButtonBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";
import { guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { type Card, type CardFact, cardReply } from "../../lib/card.js";

/**
 * /access: what you can do on this server's dashboard, privately. Read-only; managers change
 * access on the dashboard (Settings → Access). Discord's own permissions still decide commands.
 */
export const accessCommand: Command = {
  data: guildCommand(
    "access",
    "What you can open on this server's Garrison dashboard.",
    null,
  ).toJSON(),
  async execute(interaction, ctx) {
    const base = process.env.APP_URL?.replace(/\/$/, "");
    const url = base && /^https?:\/\//.test(base) ? `${base}/servers/${interaction.guildId}` : null;
    const open = url
      ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open dashboard").setURL(url)]
      : [];
    const reply = (card: Omit<Card, "title">) =>
      interaction.reply(cardReply({ title: "Your dashboard access", ...card }));

    const member = interaction.member;
    if (
      interaction.guild.ownerId === member.id ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      await reply({
        tone: "go",
        status: "Full access",
        blocks: [
          {
            text: "You have Manage Server, so the whole dashboard is yours, including who else gets in.",
          },
        ],
        actions: open,
      });
      return;
    }
    const { grants, groups } = await getDashboardAccess(ctx.db, interaction.guildId);
    const access = resolveAccess(grants, groups, member.id, [...member.roles.cache.keys()]);
    if (!access) {
      await reply({
        tone: "caution",
        status: "No access",
        blocks: [
          {
            text: "Someone with Manage Server can give it to you on the dashboard, under Settings → Access.",
          },
        ],
      });
      return;
    }
    const facts: CardFact[] = [];
    if (access.groups.length) {
      const entries = Object.entries(access.areas) as [AccessArea, "view" | "edit"][];
      const edit = entries.filter(([, l]) => l === "edit").map(([a]) => ACCESS_AREAS[a]);
      const view = entries.filter(([, l]) => l === "view").map(([a]) => ACCESS_AREAS[a]);
      facts.push({ label: "Groups", value: access.groups.join(", ") });
      if (!access.level) {
        facts.push({ label: "Can change", value: edit.join(", ") });
        facts.push({ label: "Can view", value: view.join(", ") });
      }
      facts.push({
        label: "Trusted with",
        value: access.switches.map((s) => ACCESS_SWITCHES[s].label.toLowerCase()).join(", "),
      });
    }
    await reply({
      status: access.level === "editor" ? "Editor" : access.level ? "Viewer" : "Some areas",
      blocks: access.level
        ? [
            {
              text:
                access.level === "editor"
                  ? "You can change settings and post everywhere on the dashboard."
                  : "You can see everything on the dashboard, and change nothing.",
            },
          ]
        : [],
      facts,
      actions: open,
    });
  },
};
