import type { GatehouseSettings, Lockdown } from "@garrison/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from "discord.js";
import { formatDuration } from "../../lib/duration.js";
import { brandEmbed } from "../../lib/embeds.js";
import { describeAccountAge } from "./plan.js";

export const VERIFY_BUTTON_ID = "gate:verify";

const ts = (date: Date, style: "R" | "f" = "R") =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

/** Short, mono-friendly lockdown reference for footers: "lockdown 3f2a9c". */
export const lockdownRef = (l: Pick<Lockdown, "id">) => `lockdown ${l.id.slice(0, 6)}`;

export function lockdownStartedEmbed(
  l: Lockdown,
  opts: { channels: number; failed: number; raid?: { joins: number; windowSeconds: number } },
): EmbedBuilder {
  const lines: string[] = [];
  if (opts.raid)
    lines.push(`Raid detected: ${opts.raid.joins} joins in ${opts.raid.windowSeconds} s.`);
  lines.push(`Posting is off in ${opts.channels} ${opts.channels === 1 ? "channel" : "channels"}.`);
  lines.push(l.invitesPaused ? "Invites are paused." : "Invites are still open.");
  lines.push(
    l.endsAt ? `Lifts ${ts(l.endsAt)}, or run /lockdown end.` : "Run /lockdown end to lift it.",
  );
  if (opts.failed) {
    lines.push(
      `I couldn't change ${opts.failed} ${opts.failed === 1 ? "channel" : "channels"}: check Garrison's permissions there.`,
    );
  }
  return brandEmbed({
    tone: "alert",
    title: opts.raid ? "Server locked: raid detected" : "Server locked",
    description: lines.join("\n"),
    fields: [{ name: "Reason", value: l.reason ?? "No reason given" }],
    module: "gatehouse",
    ref: lockdownRef(l),
    timestamp: l.startedAt,
  });
}

export function lockdownEndedEmbed(
  l: Lockdown,
  opts: { restored: number; failed: number },
): EmbedBuilder {
  const seconds = Math.max(
    1,
    Math.round(((l.endedAt ?? new Date()).getTime() - l.startedAt.getTime()) / 1000),
  );
  const lines = [
    `Restored ${opts.restored} channel ${opts.restored === 1 ? "permission" : "permissions"} to how they were.`,
  ];
  if (l.invitesPaused) lines.push("Invites are open again.");
  if (opts.failed)
    lines.push(`${opts.failed} couldn't be restored: the channel or role may have been deleted.`);
  return brandEmbed({
    tone: "go",
    title: `Lockdown lifted after ${formatDuration(seconds)}`,
    description: lines.join("\n"),
    module: "gatehouse",
    ref: lockdownRef(l),
  });
}

export function raidAlertEmbed(joins: number, windowSeconds: number): EmbedBuilder {
  return brandEmbed({
    tone: "alert",
    title: "Possible raid",
    description: `${joins} joins in ${windowSeconds} s. Anti-raid is set to alert only, so nothing was locked. Run /lockdown start to lock the server.`,
    module: "gatehouse",
  });
}

export function newAccountFlagEmbed(
  member: { id: string; username: string; createdAt: Date },
  days: number,
) {
  return brandEmbed({
    tone: "caution",
    title: `Flagged a ${describeAccountAge(days)} account on join`,
    fields: [
      { name: "Member", value: `<@${member.id}> · \`${member.id}\``, inline: true },
      { name: "Created", value: ts(member.createdAt), inline: true },
    ],
    module: "gatehouse",
  });
}

export function verifyPanel(
  settings: Pick<GatehouseSettings, "verifyRoleId" | "verifyMinAccountAgeDays">,
) {
  const lines = [
    `Press Verify to get <@&${settings.verifyRoleId}> and open the rest of the server.`,
  ];
  if (settings.verifyMinAccountAgeDays > 0) {
    lines.push(`Accounts must be at least ${settings.verifyMinAccountAgeDays} days old.`);
  }
  const embed = brandEmbed({
    title: "Verify to join in",
    description: lines.join("\n"),
    module: "gatehouse",
  });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel("Verify")
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

export function settingsEmbed(s: GatehouseSettings, saved: boolean): EmbedBuilder {
  const onOff = (v: boolean) => (v ? "On" : "Off");
  return brandEmbed({
    title: saved ? "Saved. Gatehouse settings updated" : "Gatehouse settings",
    fields: [
      {
        name: "Alert channel",
        value: s.alertChannelId ? `<#${s.alertChannelId}>` : "Watch log channel",
        inline: true,
      },
      { name: "Anti-raid", value: onOff(s.antiRaidEnabled), inline: true },
      {
        name: "Raid means",
        value: `${s.raidJoinCount} joins in ${s.raidWindowSeconds} s`,
        inline: true,
      },
      {
        name: "On a raid",
        value: s.raidResponse === "lockdown" ? "Lock the server" : "Alert only",
        inline: true,
      },
      {
        name: "Auto-unlock",
        value:
          s.autoUnlockMinutes > 0 ? `After ${formatDuration(s.autoUnlockMinutes * 60)}` : "Off",
        inline: true,
      },
      {
        name: "Flag new accounts",
        value: s.flagAccountAgeDays > 0 ? `Under ${s.flagAccountAgeDays} days` : "Off",
        inline: true,
      },
      {
        name: "Staff roles",
        value: s.staffRoleIds.length ? s.staffRoleIds.map((id) => `<@&${id}>`).join(" ") : "None",
      },
      {
        name: "Verification",
        value: s.verifyRoleId
          ? `Gives <@&${s.verifyRoleId}>${s.verifyMinAccountAgeDays ? ` · accounts ${s.verifyMinAccountAgeDays}+ days old` : ""}`
          : "Off",
      },
    ],
    module: "gatehouse",
  });
}
