import {
  type AiCategory,
  type AutomodConfig,
  aiFlags,
  aiSettingsFor,
  checkMessageText,
  entitlements,
  findScamLink,
  getAutomod,
  getGuildPlan,
  getWatchSettings,
  isSpam,
  RULE_TEXT,
  type ScamHit,
} from "@garrison/db";
import { type Guild, type GuildMember, type Message, PermissionFlagsBits } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { applyMemberAction } from "./service.js";

/**
 * Automod. Rules the server set (blocked words, other servers' invites, mass
 * mentions, spam) run on every message; on Pro, OpenAI's moderation model reads
 * the text too. A hit removes the message, then warns or times out as the server
 * chose; warnings feed the escalation ladder like any other. Staff (Manage
 * Messages), exempt roles and exempt channels are never checked.
 */

const SETTINGS_TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: AutomodConfig }>();
async function automod(ctx: BotContext, guildId: string) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value;
  const value = await getAutomod(ctx.db, guildId);
  cache.set(guildId, { at: Date.now(), value });
  return value;
}

/**
 * Messages automod removed in the last minute, so an auto-responder doesn't answer one
 * (responders/service.ts runs after automod on each message).
 */
const removed = new Map<string, number>();
export function wasRemovedByAutomod(messageId: string, now = Date.now()) {
  for (const [id, at] of removed) if (now - at > 60_000) removed.delete(id);
  return removed.has(messageId);
}

/** Recent message times per member, for spam. */
const recent = new Map<string, number[]>();
/** At most one automod case per member every 30 s, so a burst is one warning, not ten. */
const lastCase = new Map<string, number>();
const CASE_GAP_MS = 30_000;
/** Whether this member may get another automod case now (one every 30 s); takes the slot. */
export function caseDue(guildId: string, userId: string, now = Date.now()) {
  const key = `${guildId}:${userId}`;
  if (now - (lastCase.get(key) ?? 0) < CASE_GAP_MS) return false;
  lastCase.set(key, now);
  return true;
}
/**
 * AI checks per server per minute, so one busy server can't use up the account's rate limit
 * for everyone. Free servers get fewer, since AI moderation is on every plan.
 */
const aiBudget = new Map<string, { minute: number; used: number }>();
export const AI_PER_MINUTE = { free: 20, pro: 60 } as const;
/**
 * When OpenAI says to slow down (429), every server's AI checks pause until it says to try
 * again. Messages are still checked by word lists, links and spam rules in the meantime.
 */
let aiPausedUntil = 0;
const AI_PAUSE_DEFAULT_MS = 20_000;
const AI_PAUSE_MAX_MS = 5 * 60_000;
export const aiPaused = (now = Date.now()) => now < aiPausedUntil;
/** How long OpenAI asked to wait, from its retry-after header, within sensible bounds. */
export function pauseFor(retryAfter: string | null) {
  const s = Number(retryAfter);
  const ms = Number.isFinite(s) && s > 0 ? s * 1000 : AI_PAUSE_DEFAULT_MS;
  return Math.min(AI_PAUSE_MAX_MS, Math.max(1000, ms));
}

export interface AutomodKeys {
  openai: string | null;
}

/** OpenAI's scores for this text, or null when it can't be checked right now. */
export async function moderateText(
  key: string,
  text: string,
): Promise<Record<string, number> | null> {
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, 2000) }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (res?.status === 429) {
    aiPausedUntil = Date.now() + pauseFor(res.headers.get("retry-after"));
    return null;
  }
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    results?: { category_scores?: Record<string, number> }[];
  } | null;
  return body?.results?.[0]?.category_scores ?? null;
}

export function takeAiBudget(guildId: string, perMinute: number, now = Date.now()) {
  if (aiPaused(now)) return false;
  const minute = Math.floor(now / 60_000);
  const b = aiBudget.get(guildId);
  if (!b || b.minute !== minute) {
    aiBudget.set(guildId, { minute, used: 1 });
    return true;
  }
  if (b.used >= perMinute) return false;
  b.used++;
  return true;
}

/** Where a message was and what it said: a sent message, or one Discord blocked. */
export interface Said {
  guild: Guild;
  channelId: string;
  authorId: string;
  content: string;
}
const said = (m: Message<true>): Said => ({
  guild: m.guild,
  channelId: m.channelId,
  authorId: m.author.id,
  content: m.content,
});

export async function logToWatch(ctx: BotContext, message: Said, title: string, why: string) {
  const settings = await getWatchSettings(ctx.db, message.guild.id);
  if (!settings.logChannelId) return;
  const channel = message.guild.channels.cache.get(settings.logChannelId);
  if (!channel?.isSendable()) return;
  const quoted = message.content
    ? `\n> ${safeText(message.content.slice(0, 300)).replace(/\n/g, "\n> ")}`
    : "";
  await channel
    .send(
      cardMessage({
        tone: "caution",
        title,
        lead: `<@${message.authorId}> in <#${message.channelId}>`,
        blocks: [{ text: `${why}${quoted}` }],
        module: "watch",
        compact: true,
      }),
    )
    .catch(() => null);
}

/**
 * A scam or phishing link: remove it and time the sender out for an hour (these come
 * mostly from hacked accounts, so a ban would punish the victim), with a case so staff
 * see it and can undo it.
 */
async function removeScam(
  ctx: BotContext,
  message: Message<true>,
  member: GuildMember,
  scam: ScamHit,
) {
  const me = message.guild.members.me ?? (await message.guild.members.fetchMe());
  if (message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages))
    await message.delete().catch(() => null);
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastCase.get(key) ?? 0) < CASE_GAP_MS) return;
  lastCase.set(key, now);
  const reason = `Automod: ${RULE_TEXT.scam} (${scam.host} ${scam.why})`;
  const result = await applyMemberAction(ctx, {
    guild: message.guild,
    actor: { id: me.id, tag: me.user.username },
    target: message.author,
    member,
    action: "timeout",
    reason,
    durationSeconds: 3600,
    source: "automod",
  });
  if (!result.ok)
    await logToWatch(
      ctx,
      said(message),
      "Removed a scam link",
      `${scam.host} ${scam.why}. ${result.error}`,
    );
}

/** Check one message. Never throws: automod must not break the bot. */
export async function onAutomodMessage(ctx: BotContext, message: Message, keys: AutomodKeys) {
  if (!message.inGuild() || message.author.bot || message.system || message.webhookId) return;
  const config = await automod(ctx, message.guildId);
  if (!config.enabled && !config.scamLinks) return;
  const member = message.member;
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if (config.exemptChannelIds.includes(message.channelId)) return;
  if (config.exemptRoleIds.some((id) => member.roles.cache.has(id))) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const times = [...(recent.get(key) ?? []).filter((t) => now - t < 60_000), now];
  recent.set(key, times);
  if (recent.size > 20_000) recent.clear();

  // Scam and phishing links first: on by default, even with the rest of Automod off.
  const scam = config.scamLinks ? findScamLink(message.content) : null;
  if (scam) {
    await removeScam(ctx, message, member, scam);
    return;
  }
  if (!config.enabled) return;

  const mentions = message.mentions.users.size + message.mentions.roles.size;
  let reason: string | null = null;
  const hit = checkMessageText(config, { text: message.content, mentions }, (code) => {
    // Invites to this server are fine; the guild's vanity code is the common one.
    return message.guild.vanityURLCode?.toLowerCase() === code.toLowerCase();
  });
  if (hit) reason = RULE_TEXT[hit.rule];
  else if (isSpam(config, times, now)) reason = RULE_TEXT.spam;

  let aiHits: AiCategory[] = [];
  if (!reason && config.aiEnabled && keys.openai && message.content.trim().length >= 4) {
    const ent = entitlements(await getGuildPlan(ctx.db, message.guildId));
    const perMinute = ent["automod.aiTuning"] ? AI_PER_MINUTE.pro : AI_PER_MINUTE.free;
    if (ent["automod.ai"] && takeAiBudget(message.guildId, perMinute)) {
      const scores = await moderateText(keys.openai, message.content);
      if (scores) aiHits = aiFlags(aiSettingsFor(config, ent), scores);
    }
  }
  // Self-harm is a reason to check on someone, never to punish them.
  if (aiHits.includes("selfharm")) {
    await logToWatch(
      ctx,
      said(message),
      "Someone may need support",
      "AI moderation thinks this message mentions self-harm. Nothing was removed; please check on them.",
    );
    aiHits = aiHits.filter((c) => c !== "selfharm");
  }
  if (!reason && aiHits[0]) reason = RULE_TEXT[aiHits[0]];
  if (!reason) return;

  const me = message.guild.members.me ?? (await message.guild.members.fetchMe());
  const canDelete = message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages);
  if (canDelete) {
    removed.set(message.id, Date.now());
    await message.delete().catch(() => null);
  }

  if (config.action === "delete" || now - (lastCase.get(key) ?? 0) < CASE_GAP_MS) {
    await logToWatch(ctx, said(message), "Automod removed a message", `For ${reason}.`);
    return;
  }
  lastCase.set(key, now);
  const result = await applyMemberAction(ctx, {
    guild: message.guild,
    actor: { id: me.id, tag: me.user.username },
    target: message.author,
    member,
    action: config.action,
    reason: `Automod: ${reason}`,
    durationSeconds: config.action === "timeout" ? config.timeoutMinutes * 60 : null,
    source: "automod",
  });
  if (!result.ok)
    await logToWatch(
      ctx,
      said(message),
      "Automod removed a message",
      `For ${reason}. ${result.error}`,
    );
}
