import type { EmbedTone } from "@garrison/brand";
import {
  getLedgerSettings,
  type LedgerSettings,
  pruneLedger,
  recordLedgerEvent,
} from "@garrison/db";
import type {
  Guild,
  GuildAuditLogsEntry,
  GuildMember,
  Message,
  PartialGuildMember,
  PartialMessage,
  VoiceState,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { safeText } from "../../lib/text.js";
import { type Change, describeAudit, type LedgerDraft, TYPE_LABELS } from "./describe.js";

const SETTINGS_TTL_MS = 60_000;
const cache = new Map<string, { settings: LedgerSettings; at: number }>();

export async function cachedLedgerSettings(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.settings;
  const settings = await getLedgerSettings(ctx.db, guildId);
  cache.set(guildId, { settings, at: Date.now() });
  return settings;
}

export const invalidateLedgerSettings = (guildId: string) => cache.delete(guildId);

const toneFor = (type: string): EmbedTone => {
  if (/ban|kick|delete|timeout$|bot_add|webhook/.test(type)) return "alert";
  if (/role|permissions|server_update|channel/.test(type)) return "caution";
  if (type === "member_join") return "go";
  return "intel";
};

/** Record an event and post it to the ledger channel. Never throws: logging must not break the bot. */
export async function record(ctx: BotContext, guild: Guild, draft: LedgerDraft) {
  try {
    await ensureGuild(ctx, guild);
    const event = await recordLedgerEvent(ctx.db, { guildId: guild.id, ...draft });
    const settings = await cachedLedgerSettings(ctx, guild.id);
    if (!settings.channelId) return;
    const channel = guild.channels.cache.get(settings.channelId);
    if (!channel?.isSendable()) return;
    // A log stream: compact cards. What happened, then who and where on one line.
    const who = [
      draft.actorId ? `By <@${draft.actorId}>` : null,
      draft.targetId ? `to <@${draft.targetId}>` : null,
      draft.channelId ? `in <#${draft.channelId}>` : null,
    ].filter(Boolean);
    const reason = typeof draft.data.reason === "string" ? safeText(draft.data.reason) : null;
    const quote = (label: string, v: unknown) =>
      typeof v === "string" && v ? [{ text: `**${label}:** ${safeText(v)}` }] : [];
    await channel.send(
      cardMessage({
        tone: toneFor(draft.type),
        title: TYPE_LABELS[draft.type] ?? draft.type,
        lead: safeText(draft.summary),
        blocks: [
          ...(who.length ? [{ text: who.join(" ") }] : []),
          ...(reason ? [{ text: `**Reason:** ${reason}` }] : []),
          ...quote("Text", draft.data.text),
          ...quote("Before", draft.data.before),
          ...quote("After", draft.data.after),
        ],
        module: "ledger",
        ref: `#${event.id}`,
        at: event.createdAt,
        compact: true,
      }),
    );
  } catch (error) {
    ctx.logger.warn("Ledger record failed", { guildId: guild.id, type: draft.type, error });
  }
}

const draft = (type: string, summary: string, rest: Partial<LedgerDraft> = {}): LedgerDraft => ({
  type,
  summary,
  actorId: null,
  targetId: null,
  channelId: null,
  data: {},
  ...rest,
});

export function onAuditEntry(ctx: BotContext, entry: GuildAuditLogsEntry, guild: Guild) {
  const extra = entry.extra as { channel?: { id: string }; count?: number } | null;
  const d = describeAudit({
    action: entry.action,
    executorId: entry.executorId,
    targetId: entry.targetId,
    changes: entry.changes as Change[],
    reason: entry.reason,
    extra: extra
      ? {
          channelId: extra.channel?.id,
          count: typeof extra.count === "number" ? extra.count : undefined,
        }
      : null,
  });
  return d ? record(ctx, guild, d) : Promise.resolve();
}

export function onMemberJoin(ctx: BotContext, member: GuildMember) {
  const days = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
  return record(
    ctx,
    member.guild,
    draft("member_join", `${member.user.username} joined · account ${days} days old`, {
      targetId: member.id,
    }),
  );
}

export function onMemberLeave(ctx: BotContext, member: GuildMember | PartialGuildMember) {
  const name = member.user?.username ?? "A member";
  return record(ctx, member.guild, draft("member_leave", `${name} left`, { targetId: member.id }));
}

/** Longest message text a Ledger event keeps (Discord allows 4000 with Nitro). */
export const LEDGER_TEXT_MAX = 1500;
const clip = (text: string) =>
  text.length > LEDGER_TEXT_MAX ? `${text.slice(0, LEDGER_TEXT_MAX)}…` : text;

/**
 * A deleted message: author and channel, plus its text when the server keeps message
 * text and Garrison saw the message (only messages seen since its last restart are
 * cached; older ones arrive without content).
 */
export async function onMessageDelete(ctx: BotContext, message: Message | PartialMessage) {
  if (!message.guild || message.author?.bot) return;
  const who = message.author
    ? `A message by ${message.author.username}`
    : "A message (author unknown, it wasn't cached)";
  const keep = (await cachedLedgerSettings(ctx, message.guild.id)).keepMessageText;
  const text = keep && !message.partial ? message.content : "";
  const files =
    keep && !message.partial ? [...message.attachments.values()].map((a) => a.name) : [];
  await record(
    ctx,
    message.guild,
    draft("message_delete", `${who} was deleted`, {
      targetId: message.author?.id ?? null,
      channelId: message.channelId,
      data: {
        ...(text ? { text: clip(text) } : {}),
        ...(files.length ? { files: files.slice(0, 10) } : {}),
      },
    }),
  );
}

/** An edited message, recorded only when the server keeps message text. */
export async function onMessageEdit(
  ctx: BotContext,
  before: Message | PartialMessage,
  after: Message | PartialMessage,
) {
  if (!after.guild || before.partial || after.partial || after.author.bot) return;
  if (before.content === after.content) return; // An embed or pin changed, not the text.
  if (!(await cachedLedgerSettings(ctx, after.guild.id)).keepMessageText) return;
  await record(
    ctx,
    after.guild,
    draft("message_edit", `${after.author.username} edited a message`, {
      targetId: after.author.id,
      channelId: after.channelId,
      data: { before: clip(before.content), after: clip(after.content), messageId: after.id },
    }),
  );
}

export function onVoiceUpdate(ctx: BotContext, before: VoiceState, after: VoiceState) {
  if (before.channelId === after.channelId || !after.member || after.member.user.bot)
    return Promise.resolve();
  const user = after.member.user.username;
  const target = { targetId: after.id };
  if (!before.channelId)
    return record(
      ctx,
      after.guild,
      draft("voice_join", `${user} joined voice`, { ...target, channelId: after.channelId }),
    );
  if (!after.channelId)
    return record(
      ctx,
      after.guild,
      draft("voice_leave", `${user} left voice`, { ...target, channelId: before.channelId }),
    );
  return record(
    ctx,
    after.guild,
    draft("voice_switch", `${user} switched voice channel`, {
      ...target,
      channelId: after.channelId,
      data: { from: before.channelId },
    }),
  );
}

const PRUNE_EVERY_MS = 3_600_000;
let lastPrune = 0;

/** Remove expired events, at most hourly. The database decides what's expired. */
export async function maybePruneLedger(ctx: BotContext) {
  if (Date.now() - lastPrune < PRUNE_EVERY_MS) return;
  lastPrune = Date.now();
  const removed = await pruneLedger(ctx.db);
  if (removed) ctx.logger.info("Pruned expired ledger events", { removed });
}
