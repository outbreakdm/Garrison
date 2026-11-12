import {
  type AiCategory,
  type AutomodConfig,
  aiFlags,
  checkMessageText,
  entitlements,
  getAutomod,
  getGuildPlan,
  getWatchSettings,
  isSpam,
  RULE_TEXT,
} from "@garrison/db";
import { type Message, PermissionFlagsBits } from "discord.js";
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

/** Recent message times per member, for spam. */
const recent = new Map<string, number[]>();
/** At most one automod case per member every 30 s, so a burst is one warning, not ten. */
const lastCase = new Map<string, number>();
const CASE_GAP_MS = 30_000;
/** AI checks per server per minute, so a busy server can't run up the API. */
const aiBudget = new Map<string, { minute: number; used: number }>();
const AI_PER_MINUTE = 60;

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
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    results?: { category_scores?: Record<string, number> }[];
  } | null;
  return body?.results?.[0]?.category_scores ?? null;
}

function takeAiBudget(guildId: string, now = Date.now()) {
  const minute = Math.floor(now / 60_000);
  const b = aiBudget.get(guildId);
  if (!b || b.minute !== minute) {
    aiBudget.set(guildId, { minute, used: 1 });
    return true;
  }
  if (b.used >= AI_PER_MINUTE) return false;
  b.used++;
  return true;
}

async function logToWatch(ctx: BotContext, message: Message<true>, title: string, why: string) {
  const settings = await getWatchSettings(ctx.db, message.guildId);
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
        lead: `<@${message.author.id}> in <#${message.channelId}>`,
        blocks: [{ text: `${why}${quoted}` }],
        module: "watch",
        compact: true,
      }),
    )
    .catch(() => null);
}

/** Check one message. Never throws: automod must not break the bot. */
export async function onAutomodMessage(ctx: BotContext, message: Message, keys: AutomodKeys) {
  if (!message.inGuild() || message.author.bot || message.system || message.webhookId) return;
  const config = await automod(ctx, message.guildId);
  if (!config.enabled) return;
  const member = message.member;
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if (config.exemptChannelIds.includes(message.channelId)) return;
  if (config.exemptRoleIds.some((id) => member.roles.cache.has(id))) return;

  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const times = [...(recent.get(key) ?? []).filter((t) => now - t < 60_000), now];
  recent.set(key, times);
  if (recent.size > 20_000) recent.clear();

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
    if (ent["automod.ai"] && takeAiBudget(message.guildId)) {
      const scores = await moderateText(keys.openai, message.content);
      if (scores) aiHits = aiFlags(config, scores);
    }
  }
  // Self-harm is a reason to check on someone, never to punish them.
  if (aiHits.includes("selfharm")) {
    await logToWatch(
      ctx,
      message,
      "Someone may need support",
      "AI moderation thinks this message mentions self-harm. Nothing was removed; please check on them.",
    );
    aiHits = aiHits.filter((c) => c !== "selfharm");
  }
  if (!reason && aiHits[0]) reason = RULE_TEXT[aiHits[0]];
  if (!reason) return;

  const me = message.guild.members.me ?? (await message.guild.members.fetchMe());
  const canDelete = message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages);
  if (canDelete) await message.delete().catch(() => null);

  if (config.action === "delete" || now - (lastCase.get(key) ?? 0) < CASE_GAP_MS) {
    await logToWatch(ctx, message, "Automod removed a message", `For ${reason}.`);
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
    await logToWatch(ctx, message, "Automod removed a message", `For ${reason}. ${result.error}`);
}
