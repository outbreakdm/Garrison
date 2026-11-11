import type { EmbedTone } from "@garrison/brand";
import type { ModCase } from "@garrison/db";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import { type Card, type CardFact, ts } from "../../lib/card.js";
import { formatDuration } from "../../lib/duration.js";
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

export const caseRef = (c: Pick<ModCase, "caseNumber">) => `case #${c.caseNumber}`;

const reasonOf = (c: Pick<ModCase, "reason">) => (c.reason ? safeText(c.reason) : NO_REASON);

function moderatorLabel(c: ModCase) {
  if (c.source === "escalation") return "Escalation rule";
  if (c.source === "automod") return "Automod";
  return `<@${c.moderatorId}>`;
}

/** The Undo button for a case; disabled once it's undone. */
export function undoButton(c: Pick<ModCase, "caseNumber">, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(`${UNDO_PREFIX}:${c.caseNumber}`)
    .setLabel(disabled ? "Undone" : "Undo")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

/** Full record of a case, for the log channel, `/case` and after an undo. */
export function caseCard(c: ModCase, opts: { button?: ButtonBuilder } = {}): Card {
  const facts: CardFact[] = [];
  if (c.targetId) facts.push({ label: "Member", value: `<@${c.targetId}> · \`${c.targetId}\`` });
  facts.push({ label: "By", value: moderatorLabel(c) });
  if (c.durationSeconds) facts.push({ label: "Length", value: formatDuration(c.durationSeconds) });
  if (c.action === "purge") {
    const d = c.details as { channelId?: string; deleted?: number };
    facts.push({ label: "Deleted", value: `${d.deleted ?? 0} in <#${d.channelId}>` });
  }
  return {
    tone: toneFor(c),
    title: `${actionNoun(c.action)}${c.targetTag ? ` · ${safeText(c.targetTag)}` : ""}`,
    status: c.revokedAt ? "Undone" : undefined,
    lead: c.revokedAt ? `by <@${c.revokedById}> ${ts(c.revokedAt)}` : undefined,
    blocks: [{ text: `**Reason:** ${reasonOf(c)}`, button: opts.button }],
    facts,
    module: "watch",
    ref: caseRef(c),
    at: c.createdAt,
  };
}

/** Reply to the moderator: what happened, with Undo beside the reason. */
export function confirmationCard(
  c: ModCase,
  opts: { dmSent: boolean | null; escalated?: ModCase | null; undo?: boolean },
): Card {
  const action = c.action as MemberAction;
  const blocks: Card["blocks"] = [
    { text: `**Reason:** ${reasonOf(c)}`, button: opts.undo ? undoButton(c) : undefined },
  ];
  if (opts.dmSent === false) blocks.push({ text: "I couldn't DM them: their DMs are closed." });
  if (opts.escalated) {
    const e = opts.escalated;
    const forDuration = e.durationSeconds ? ` for ${formatDuration(e.durationSeconds)}` : "";
    blocks.push({
      text: `That reached an escalation rule (${e.reason}), so I also applied a ${actionNoun(e.action).toLowerCase()}${forDuration}. See ${caseRef(e)}.`,
    });
  }
  return {
    tone: toneFor(c),
    title: confirmationTitle(action, safeText(c.targetTag ?? "member"), c.durationSeconds),
    blocks,
    module: "watch",
    ref: caseRef(c),
  };
}

/** The DM a member gets: neutral and factual. What happened, why, and how to appeal. */
export function dmCard(opts: {
  action: MemberAction;
  guildName: string;
  reason: string | null;
  durationSeconds?: number | null;
  appealText?: string | null;
}): Card {
  return {
    tone: opts.action === "kick" || opts.action === "ban" ? "alert" : "caution",
    title: dmTitle(opts.action, safeText(opts.guildName), opts.durationSeconds),
    blocks: [
      { text: `**Reason:** ${opts.reason ? safeText(opts.reason) : NO_REASON}` },
      { text: `**To appeal:** ${opts.appealText || DEFAULT_APPEAL_TEXT}` },
    ],
    module: "watch",
  };
}

export function purgeCard(
  c: ModCase,
  opts: { requested: number; deleted: number; channelId: string },
): Card {
  const noun = opts.deleted === 1 ? "message" : "messages";
  const blocks: Card["blocks"] = [];
  if (opts.deleted < opts.requested)
    blocks.push({
      text: "I skip pinned messages and anything older than 14 days, which Discord can't bulk-delete.",
    });
  return {
    tone: "caution",
    title: `Deleted ${opts.deleted} ${noun}`,
    lead: `In <#${opts.channelId}>${c.targetTag ? `, only from ${safeText(c.targetTag)}` : ""}`,
    blocks,
    module: "watch",
    ref: caseRef(c),
  };
}
