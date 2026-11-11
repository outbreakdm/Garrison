import type { GatehouseSettings, Lockdown } from "@garrison/db";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import { type Card, cardMessage, factLines, ts } from "../../lib/card.js";
import { formatDuration } from "../../lib/duration.js";
import { safeText } from "../../lib/text.js";
import { describeAccountAge } from "./plan.js";

export const VERIFY_BUTTON_ID = "gate:verify";

/** Short, mono-friendly lockdown reference for footers: "lockdown 3f2a9c". */
export const lockdownRef = (l: Pick<Lockdown, "id">) => `lockdown ${l.id.slice(0, 6)}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function lockdownStartedCard(
  l: Lockdown,
  opts: { channels: number; failed: number; raid?: { joins: number; windowSeconds: number } },
): Card {
  const lines = [
    `Posting is off in ${plural(opts.channels, "channel", "channels")}.`,
    l.invitesPaused ? "Invites are paused." : "Invites are still open.",
    l.endsAt
      ? `Lifts ${ts(l.endsAt)}, or run \`/lockdown end\`.`
      : "Run `/lockdown end` to lift it.",
  ];
  const blocks: Card["blocks"] = [{ text: lines.join("\n") }];
  if (opts.failed)
    blocks.push({
      text: `I couldn't change ${plural(opts.failed, "channel", "channels")}: check Garrison's permissions there.`,
    });
  return {
    tone: "alert",
    title: "Server locked",
    status: opts.raid
      ? `Raid detected: ${opts.raid.joins} joins in ${opts.raid.windowSeconds} s`
      : undefined,
    blocks,
    facts: [{ label: "Reason", value: l.reason ? safeText(l.reason) : "" }],
    module: "gatehouse",
    ref: lockdownRef(l),
    at: l.startedAt,
  };
}

export function lockdownEndedCard(l: Lockdown, opts: { restored: number; failed: number }): Card {
  const seconds = Math.max(
    1,
    Math.round(((l.endedAt ?? new Date()).getTime() - l.startedAt.getTime()) / 1000),
  );
  const lines = [
    `Restored ${plural(opts.restored, "channel permission", "channel permissions")} to how they were.`,
  ];
  if (l.invitesPaused) lines.push("Invites are open again.");
  const blocks: Card["blocks"] = [{ text: lines.join("\n") }];
  if (opts.failed)
    blocks.push({
      text: `${opts.failed} couldn't be restored: the channel or role may have been deleted.`,
    });
  return {
    tone: "go",
    title: `Lockdown lifted after ${formatDuration(seconds)}`,
    blocks,
    module: "gatehouse",
    ref: lockdownRef(l),
  };
}

export const noLockdownCard = (): Card => ({
  tone: "go",
  title: "No lockdown active",
  lead: "Everyone can post. Start one with `/lockdown start`.",
  module: "gatehouse",
});

export function raidAlertCard(joins: number, windowSeconds: number): Card {
  return {
    tone: "alert",
    title: "Possible raid",
    status: `${joins} joins in ${windowSeconds} s`,
    blocks: [
      {
        text: "Anti-raid is set to alert only, so nothing was locked. Run `/lockdown start` to lock the server.",
      },
    ],
    module: "gatehouse",
  };
}

export function newAccountFlagCard(
  member: { id: string; username: string; createdAt: Date },
  days: number,
): Card {
  return {
    tone: "caution",
    title: `Flagged a ${describeAccountAge(days)} account on join`,
    facts: [
      { label: "Member", value: `<@${member.id}> · \`${member.id}\`` },
      { label: "Created", value: ts(member.createdAt) },
    ],
    module: "gatehouse",
  };
}

/** The panel members press to get the verified role. Posted once; the button answers privately. */
export function verifyPanel(
  settings: Pick<GatehouseSettings, "verifyRoleId" | "verifyMinAccountAgeDays">,
) {
  const lines = [
    `Press Verify to get <@&${settings.verifyRoleId}> and open the rest of the server.`,
  ];
  if (settings.verifyMinAccountAgeDays > 0)
    lines.push(`-# Accounts must be at least ${settings.verifyMinAccountAgeDays} days old.`);
  return cardMessage({
    title: "Verify to join in",
    blocks: [
      {
        text: lines.join("\n"),
        button: new ButtonBuilder()
          .setCustomId(VERIFY_BUTTON_ID)
          .setLabel("Verify")
          .setStyle(ButtonStyle.Primary),
      },
    ],
    module: "gatehouse",
  });
}

/** Gatehouse settings, grouped the way the dashboard's Security page groups them. */
export function settingsCard(s: GatehouseSettings, saved: boolean): Card {
  const onOff = (v: boolean) => (v ? "On" : "Off");
  const group = (heading: string, facts: { label: string; value: string }[]) => ({
    text: `**${heading}**\n${factLines(facts)}`,
  });
  return {
    tone: saved ? "go" : "volt",
    title: saved ? "Gatehouse settings saved" : "Gatehouse settings",
    blocks: [
      group("Alerts", [
        {
          label: "Channel",
          value: s.alertChannelId ? `<#${s.alertChannelId}>` : "Watch log channel",
        },
        {
          label: "Staff roles",
          value: s.staffRoleIds.length ? s.staffRoleIds.map((id) => `<@&${id}>`).join(" ") : "None",
        },
      ]),
      "divider",
      group("Anti-raid", [
        { label: "Status", value: onOff(s.antiRaidEnabled) },
        { label: "A raid is", value: `${s.raidJoinCount} joins in ${s.raidWindowSeconds} s` },
        {
          label: "On a raid",
          value: s.raidResponse === "lockdown" ? "Lock the server" : "Alert only",
        },
        {
          label: "Auto-unlock",
          value:
            s.autoUnlockMinutes > 0 ? `After ${formatDuration(s.autoUnlockMinutes * 60)}` : "Off",
        },
        {
          label: "Flag new accounts",
          value: s.flagAccountAgeDays > 0 ? `Under ${s.flagAccountAgeDays} days` : "Off",
        },
      ]),
      "divider",
      group("Anti-nuke", [
        {
          label: "Status",
          value: s.antiNukeEnabled
            ? `On · ${s.nukeDeleteThreshold} deletions or ${s.nukeBanThreshold} bans in ${s.nukeWindowSeconds} s`
            : "Off",
        },
        {
          label: "Trusted (owner sets)",
          value: s.antiNukeTrustedIds.length
            ? s.antiNukeTrustedIds.map((id) => `<@${id}>`).join(" ")
            : "Owner only",
        },
      ]),
      "divider",
      group("Verification", [
        {
          label: "Status",
          value: s.verifyRoleId
            ? `Gives <@&${s.verifyRoleId}>${s.verifyMinAccountAgeDays ? ` · accounts ${s.verifyMinAccountAgeDays}+ days old` : ""}`
            : "Off",
        },
      ]),
    ],
    module: "gatehouse",
  };
}
