import {
  ACCESS_AREAS,
  ACCESS_SWITCHES,
  type AccessArea,
  getDashboardAccess,
  resolveAccess,
} from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";

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
    const link =
      base && /^https?:\/\//.test(base) ? `\n${base}/servers/${interaction.guildId}` : "";
    const member = interaction.member;
    if (
      interaction.guild.ownerId === member.id ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: `You have Manage Server, so the whole dashboard is yours, including who else gets in.${link}`,
        ...ephemeral,
      });
      return;
    }
    const { grants, groups } = await getDashboardAccess(ctx.db, interaction.guildId);
    const access = resolveAccess(grants, groups, member.id, [...member.roles.cache.keys()]);
    if (!access) {
      await interaction.reply({
        content:
          "You don't have access to this server's dashboard. Someone with Manage Server can give it to you on the dashboard (Settings → Access).",
        ...ephemeral,
      });
      return;
    }
    const lines: string[] = [];
    if (access.level)
      lines.push(
        access.level === "editor"
          ? "**Editor:** you can change settings and post everywhere on the dashboard."
          : "**Viewer:** you can see everything on the dashboard, and change nothing.",
      );
    if (access.groups.length) {
      const entries = Object.entries(access.areas) as [AccessArea, "view" | "edit"][];
      const edit = entries.filter(([, l]) => l === "edit").map(([a]) => ACCESS_AREAS[a]);
      const view = entries.filter(([, l]) => l === "view").map(([a]) => ACCESS_AREAS[a]);
      lines.push(`**Groups:** ${access.groups.join(", ")}`);
      if (!access.level) {
        if (edit.length) lines.push(`Change: ${edit.join(", ")}`);
        if (view.length) lines.push(`View: ${view.join(", ")}`);
      }
      if (access.switches.length)
        lines.push(
          `Trusted with: ${access.switches.map((s) => ACCESS_SWITCHES[s].label.toLowerCase()).join(", ")}`,
        );
    }
    await interaction.reply({ content: `${lines.join("\n")}${link}`, ...ephemeral });
  },
};
