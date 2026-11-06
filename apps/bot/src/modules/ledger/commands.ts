import { searchLedger, updateLedgerSettings } from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { ephemeral, guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { brandEmbed } from "../../lib/embeds.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { TYPE_LABELS } from "./describe.js";
import { cachedLedgerSettings, invalidateLedgerSettings } from "./service.js";

export const logs: Command = {
  data: guildCommand(
    "logs",
    "Search the server's event log, or choose where events are posted.",
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
        .setDescription("Where events are posted, and how long they're kept")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Post each event here")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption((o) =>
          o.setName("stop_posting").setDescription("Keep events in the dashboard only"),
        )
        .addIntegerOption((o) =>
          o
            .setName("keep_days")
            .setDescription("Days to keep events, 7 to 365 (default: 30)")
            .setMinValue(7)
            .setMaxValue(365),
        ),
    )
    .toJSON(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    await ensureGuild(ctx, guild);

    if (interaction.options.getSubcommand() === "search") {
      const user = interaction.options.getUser("user", true);
      const events = await searchLedger(ctx.db, { guildId: guild.id, userId: user.id, limit: 15 });
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
        ...ephemeral,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const stop = interaction.options.getBoolean("stop_posting");
    const keep = interaction.options.getInteger("keep_days");
    const patch: { channelId?: string | null; retentionDays?: number } = {};
    if (channel) patch.channelId = channel.id;
    if (stop) patch.channelId = null;
    if (keep !== null) patch.retentionDays = keep;
    const s = Object.keys(patch).length
      ? await updateLedgerSettings(ctx.db, guild.id, patch)
      : await cachedLedgerSettings(ctx, guild.id);
    invalidateLedgerSettings(guild.id);
    await interaction.reply({
      embeds: [
        brandEmbed({
          title: Object.keys(patch).length ? "Saved. Ledger settings updated" : "Ledger settings",
          fields: [
            {
              name: "Posting to",
              value: s.channelId ? `<#${s.channelId}>` : "Dashboard only",
              inline: true,
            },
            { name: "Kept for", value: `${s.retentionDays} days`, inline: true },
          ],
          module: "ledger",
        }),
      ],
      ...ephemeral,
    });
  },
};
