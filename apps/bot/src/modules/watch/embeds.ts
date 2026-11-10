import type { ModCase } from "@garrison/db";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder } from "discord.js";
import { serverUrl } from "../../lib/dashboard.js";
import { formatDuration } from "../../lib/duration.js";
import { brandEmbed, type EmbedKind } from "../../lib/embeds.js";
import { safeText } from "../../lib/text.js";
import {
  actionNoun,
  canUndo,
  confirmationTitle,
  DEFAULT_APPEAL_TEXT,
  dmTitle,
  type MemberAction,
  NO_REASON,
} from "./copy.js";

export const UNDO_PREFIX = "watch:undo";

/** A kick or ban is severe, so its confirmation is red. Anything undone, or milder, is green. */
const confirmationKind = (c: ModCase): EmbedKind =>
  !c.revokedAt && (c.action === "kick" || c.action === "ban") ? "danger" : "done";

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

/**
 * Full record of a case, for the log channel and `/case`. A record has no
 * colour; pass "done" when it's the answer to someone pressing Undo.
 */
export function caseEmbed(c: ModCase, kind: EmbedKind = "neutral"): EmbedBuilder {
  const title = `${actionNoun(c.action)}${c.revokedAt ? " (undone)" : ""}${c.targetTag ? ` · ${c.targetTag}` : ""}`;
  return brandEmbed({
    kind,
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
  if (opts.dmSent === false) lines.push("They weren't told by DM: their DMs are closed.");
  if (opts.escalated) {
    const e = opts.escalated;
    const forDuration = e.durationSeconds ? ` for ${formatDuration(e.durationSeconds)}` : "";
    lines.push(
      `**Also:** that made ${e.reason}, so they got a ${actionNoun(e.action).toLowerCase()}${forDuration} too (${caseRef(e)}).`,
    );
  }
  return brandEmbed({
    kind: confirmationKind(c),
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
  // A notice to the member: plain and factual, so no colour.
  return brandEmbed({
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

/**
 * The buttons under a case: Undo, when it can be undone (shown disabled once
 * it has been), and a link to the member's page on the dashboard. Null when
 * there's neither.
 */
export function caseRow(
  c: Pick<ModCase, "caseNumber" | "guildId" | "targetId" | "action" | "revokedAt">,
  opts: { undone?: boolean } = {},
) {
  const buttons: ButtonBuilder[] = [];
  if (opts.undone || (canUndo(c.action) && !c.revokedAt))
    buttons.push(...undoRow(c, Boolean(opts.undone)).components);
  const url = c.targetId ? serverUrl(c.guildId, `watch/member/${c.targetId}`) : null;
  if (url)
    buttons.push(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel("Open in dashboard"),
    );
  return buttons.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) : null;
}

export function confirmationEmbedForPurge(
  c: ModCase,
  opts: { requested: number; deleted: number; channelId: string },
): EmbedBuilder {
  const noun = opts.deleted === 1 ? "message" : "messages";
  const lines = [
    `In <#${opts.channelId}>${c.targetTag ? `, only from ${safeText(c.targetTag)}` : ""}. This can't be undone.`,
  ];
  if (opts.deleted < opts.requested) {
    lines.push(
      `${opts.requested - opts.deleted} were left: pinned messages and anything older than 14 days can't be bulk-deleted.`,
    );
  }
  // Deleted messages don't come back, so this confirmation is red.
  return brandEmbed({
    kind: "danger",
    title: `Deleted ${opts.deleted} ${noun}`,
    description: lines.join("\n"),
    module: "watch",
    ref: caseRef(c),
  });
}
