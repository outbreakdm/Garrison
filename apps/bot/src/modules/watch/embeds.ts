import type { EmbedTone } from "@garrison/brand";
import type { ModCase } from "@garrison/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from "discord.js";
import { formatDuration } from "../../lib/duration.js";
import { brandEmbed } from "../../lib/embeds.js";
import { safeText } from "../../lib/text.js";
import {
  actionNoun,
  confirmationTitle,
  DEFAULT_APPEAL_TEXT,
  dmTitle,
  type MemberAction,
  NO_REASON,
} from "./copy.js";

export const UNDO_PREFIX = "watch:undo";

const toneFor = (c: ModCase): EmbedTone => {
  if (c.revokedAt) return "go";
  return c.action === "kick" || c.action === "ban" ? "alert" : "caution";
};

const ts = (date: Date, style: "R" | "f" = "R") =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

export const caseRef = (c: Pick<ModCase, "caseNumber">) => `case #${c.caseNumber}`;

function moderatorLabel(c: ModCase) {
  if (c.source === "escalation") return "Escalation rule";
  if (c.source === "automod") return "Automod";
  return `<@${c.moderatorId}>`;
}

function caseFields(c: ModCase) {
  const fields: { name: string; value: string; inline?: boolean }[] = [];
  if (c.targetId)
    fields.push({ name: "Member", value: `<@${c.targetId}> · \`${c.targetId}\``, inline: true });
  fields.push({ name: "By", value: moderatorLabel(c), inline: true });
  if (c.durationSeconds) {
    fields.push({ name: "Duration", value: formatDuration(c.durationSeconds), inline: true });
  }
  if (c.action === "purge") {
    const d = c.details as { channelId?: string; deleted?: number };
    fields.push({ name: "Deleted", value: `${d.deleted ?? 0} in <#${d.channelId}>`, inline: true });
  }
  fields.push({ name: "Reason", value: c.reason ? safeText(c.reason) : NO_REASON });
  if (c.revokedAt) {
    fields.push({ name: "Undone", value: `by <@${c.revokedById}> ${ts(c.revokedAt)}` });
  }
  return fields;
}

/** Full record of a case, for the log channel and `/case`. */
export function caseEmbed(c: ModCase): EmbedBuilder {
  const title = `${actionNoun(c.action)}${c.revokedAt ? " (undone)" : ""}${c.targetTag ? ` · ${c.targetTag}` : ""}`;
  return brandEmbed({
    tone: toneFor(c),
    title,
    fields: caseFields(c),
    module: "watch",
    ref: caseRef(c),
    timestamp: c.createdAt,
  });
}

/** Reply to the moderator: what happened, plus undo. */
export function confirmationEmbed(
  c: ModCase,
  opts: { dmSent: boolean | null; escalated?: ModCase | null },
): EmbedBuilder {
  const action = c.action as MemberAction;
  const lines = [`**Reason:** ${c.reason ? safeText(c.reason) : NO_REASON}`];
  if (opts.dmSent === false) lines.push("I couldn't DM them: their DMs are closed.");
  if (opts.escalated) {
    const e = opts.escalated;
    const forDuration = e.durationSeconds ? ` for ${formatDuration(e.durationSeconds)}` : "";
    lines.push(
      `That reached an escalation rule (${e.reason}), so I applied a ${actionNoun(e.action).toLowerCase()}${forDuration}. See ${caseRef(e)}.`,
    );
  }
  return brandEmbed({
    tone: toneFor(c),
    title: confirmationTitle(action, c.targetTag ?? "member", c.durationSeconds),
    description: lines.join("\n"),
    module: "watch",
    ref: caseRef(c),
  });
}

export function dmEmbed(opts: {
  action: MemberAction;
  guildName: string;
  reason: string | null;
  durationSeconds?: number | null;
  appealText?: string | null;
}): EmbedBuilder {
  return brandEmbed({
    tone: opts.action === "kick" || opts.action === "ban" ? "alert" : "caution",
    title: dmTitle(opts.action, opts.guildName, opts.durationSeconds),
    fields: [
      { name: "Reason", value: opts.reason ? safeText(opts.reason) : NO_REASON },
      { name: "How to appeal", value: opts.appealText || DEFAULT_APPEAL_TEXT },
    ],
    module: "watch",
  });
}

export function undoRow(c: Pick<ModCase, "caseNumber">, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${UNDO_PREFIX}:${c.caseNumber}`)
      .setLabel(disabled ? "Undone" : "Undo")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

export function confirmationEmbedForPurge(
  c: ModCase,
  opts: { requested: number; deleted: number; channelId: string },
): EmbedBuilder {
  const noun = opts.deleted === 1 ? "message" : "messages";
  const lines: string[] = [];
  if (opts.deleted < opts.requested) {
    lines.push(
      "I skip pinned messages and anything older than 14 days, which Discord can't bulk-delete.",
    );
  }
  if (c.targetTag) lines.push(`Only messages from ${c.targetTag}.`);
  return brandEmbed({
    tone: "caution",
    title: `Deleted ${opts.deleted} ${noun}`,
    description: [`In <#${opts.channelId}>.`, ...lines].join(" "),
    module: "watch",
    ref: caseRef(c),
  });
}
