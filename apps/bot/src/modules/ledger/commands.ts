import { searchLedger, updateLedgerSettings } from "@garrison/db";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { guildCommand } from "../../commands/builders.js";
import type { Command } from "../../commands/types.js";
import { cardReply, ts } from "../../lib/card.js";
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
      // One event per line: what happened in bold, the detail, then when.
      const lines = events.map((e) => {
        const role = e.actorId === user.id ? "by them" : "to them";
        return `\`#${e.id}\` **${TYPE_LABELS[e.type] ?? e.type}** · ${safeText(e.summary)} · ${role} · ${ts(e.createdAt)}`;
      });
      await interaction.reply(
        cardReply({
          tone: "intel",
          title: `Ledger for ${safeText(user.username)}`,
          lead: lines.length ? undefined : "No events in the log for this member.",
          blocks: lines.length ? [{ text: lines.join("\n") }] : [],
          module: "ledger",
          ref: lines.length ? `latest ${events.length}` : undefined,
        }),
      );
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
    const saved = Object.keys(patch).length > 0;
    await interaction.reply(
      cardReply({
        tone: saved ? "go" : "volt",
        title: saved ? "Ledger settings saved" : "Ledger settings",
        facts: [
          { label: "Posting to", value: s.channelId ? `<#${s.channelId}>` : "Dashboard only" },
          { label: "Kept for", value: `${s.retentionDays} days` },
        ],
        module: "ledger",
      }),
    );
  },
};
