import { searchLedger } from "@garrison/db";
import { PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { linkRow, serverUrl, settingsReply } from "../../lib/dashboard.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { TYPE_LABELS } from "./describe.js";
import { cachedLedgerSettings } from "./service.js";

export const logs: Command = {
  data: guildCommand(
    "logs",
    "Search the server's event log, or see where events are posted.",
    PermissionFlagsBits.ManageGuild,
  )
    .addSubcommand((s) =>
      s
        .setName("search")
        .setDescription("Recent events involving a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Member to look up").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("settings")
        .setDescription("Where events are posted and how long they're kept, set on the dashboard"),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);

    if (interaction.options.getSubcommand() === "search") {
      const user = interaction.options.getUser("user", true);
      const events = await searchLedger(ctx.db, { guildId: guild.id, userId: user.id, limit: 15 });
      const url = serverUrl(guild.id, `ledger?user=${user.id}`);
      const lines = events.map((e) => {
        const when = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`;
        const role = e.actorId === user.id ? "did" : "to them";
        return `\`#${e.id}\` ${TYPE_LABELS[e.type] ?? e.type} · ${safeText(e.summary)} · ${role} · ${when}`;
      });
      await interaction.reply({
        embeds: [
          brandEmbed({
            tone: "intel",
            title: `Ledger for ${safeText(user.username)}`,
            description: lines.length ? lines.join("\n") : "No events.",
            module: "ledger",
            ref: `latest ${events.length}`,
          }),
        ],
        components: url ? [linkRow(url, "All their events")] : [],
        ...ephemeral,
      });
      return;
    }

    const settings = await cachedLedgerSettings(ctx, guild.id);
    await interaction.reply(
      settingsReply({
        subject: "Ledger settings are",
        url: serverUrl(guild.id, "ledger?edit=settings#settings"),
        label: "Change Ledger settings",
        embed: brandEmbed({
          title: "Ledger settings",
          fields: [
            {
              name: "Posting to",
              value: settings.channelId ? `<#${settings.channelId}>` : "Dashboard only",
              inline: true,
            },
            { name: "Kept for", value: `${settings.retentionDays} days`, inline: true },
          ],
          module: "ledger",
        }),
      }),
    );
  },
};
