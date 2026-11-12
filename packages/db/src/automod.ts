/**
 * Automod: rules each server sets on the dashboard (blocked words, invite links,
 * mass mentions, message spam), and on Pro an AI check with OpenAI's moderation
 * model. Pure and shared (`@garrison/db/cards`): the bot judges messages with the
 * same rules the dashboard checks settings with.
 *
 * Self-harm is never punished: the AI flag on it only alerts the staff, so
 * someone can check on the person.
 */

import { type Entitlements, FEATURES } from "./plans";
import type { Parsed } from "./rally";

export type AutomodAction = "delete" | "warn" | "timeout";
export type AiCategory = "harassment" | "hate" | "sexual" | "violence" | "illicit" | "selfharm";
export type AiStrictness = "low" | "medium" | "high";

export interface AutomodConfig {
  enabled: boolean;
  /** Remove invite links to other servers. */
  invites: boolean;
  /** Most user and role mentions in one message. 0: off. */
  mentionLimit: number;
  /** Messages allowed within `spamSeconds` before it's spam. 0: off. */
  spamCount: number;
  spamSeconds: number;
  /** Blocked words or phrases, matched as whole words, any case. */
  words: string[];
  /** After removing the message. */
  action: AutomodAction;
  timeoutMinutes: number;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  /** Pro: OpenAI's moderation model reads each message's text. */
  aiEnabled: boolean;
  aiCategories: AiCategory[];
  aiStrictness: AiStrictness;
}

export const AI_CATEGORIES: Record<AiCategory, { label: string; openai: string[] }> = {
  harassment: { label: "Harassment and threats", openai: ["harassment", "harassment/threatening"] },
  hate: { label: "Hate", openai: ["hate", "hate/threatening"] },
  sexual: { label: "Sexual content", openai: ["sexual"] },
  violence: { label: "Violence and gore", openai: ["violence", "violence/graphic"] },
  illicit: { label: "Illegal activity", openai: ["illicit", "illicit/violent"] },
  selfharm: {
    label: "Self-harm (alerts staff, never punishes)",
    openai: ["self-harm", "self-harm/intent", "self-harm/instructions"],
  },
};
/** A score at or above this flags the message. */
export const AI_THRESHOLD: Record<AiStrictness, number> = { low: 0.9, medium: 0.7, high: 0.5 };

export const AUTOMOD_LIMITS = {
  word: 40,
  mentionLimit: 50,
  spamCount: 20,
  spamSeconds: 60,
  timeoutMinutes: 10_080,
  exempt: 25,
} as const;
export const WORDS_HARD_MAX = FEATURES["automod.words"].pro;

export const DEFAULT_AUTOMOD: AutomodConfig = {
  enabled: false,
  invites: true,
  mentionLimit: 5,
  spamCount: 6,
  spamSeconds: 8,
  words: [],
  action: "delete",
  timeoutMinutes: 10,
  exemptRoleIds: [],
  exemptChannelIds: [],
  aiEnabled: false,
  aiCategories: ["harassment", "hate", "sexual", "selfharm"],
  aiStrictness: "medium",
};

const SNOWFLAKE = /^\d{17,20}$/;
const ids = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map(String))].filter((x) => SNOWFLAKE.test(x)) : [];
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const isAction = (v: unknown): v is AutomodAction =>
  v === "delete" || v === "warn" || v === "timeout";
const isStrictness = (v: unknown): v is AiStrictness =>
  v === "low" || v === "medium" || v === "high";
const isCategory = (v: unknown): v is AiCategory =>
  typeof v === "string" && Object.hasOwn(AI_CATEGORIES, v);

/** Words as typed (one per line or comma), cleaned: trimmed, lowercased, unique. */
export function cleanWords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\n,]/);
  return [...new Set(list.map((w) => w.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];
}

/** A stored row, read leniently. */
export function readAutomod(
  raw: Partial<Record<keyof AutomodConfig, unknown>> | null,
): AutomodConfig {
  if (!raw) return { ...DEFAULT_AUTOMOD };
  return {
    enabled: raw.enabled === true,
    invites: raw.invites !== false,
    mentionLimit: int(raw.mentionLimit, 0, AUTOMOD_LIMITS.mentionLimit, 5),
    spamCount: int(raw.spamCount, 0, AUTOMOD_LIMITS.spamCount, 6),
    spamSeconds: int(raw.spamSeconds, 2, AUTOMOD_LIMITS.spamSeconds, 8),
    words: cleanWords(raw.words).slice(0, WORDS_HARD_MAX),
    action: isAction(raw.action) ? raw.action : "delete",
    timeoutMinutes: int(raw.timeoutMinutes, 1, AUTOMOD_LIMITS.timeoutMinutes, 10),
    exemptRoleIds: ids(raw.exemptRoleIds),
    exemptChannelIds: ids(raw.exemptChannelIds),
    aiEnabled: raw.aiEnabled === true,
    aiCategories: Array.isArray(raw.aiCategories) ? raw.aiCategories.filter(isCategory) : [],
    aiStrictness: isStrictness(raw.aiStrictness) ? raw.aiStrictness : "medium",
  };
}

/** Check a change from the dashboard against its shape and the plan. */
export function checkAutomod(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: AutomodConfig,
): Parsed<AutomodConfig> {
  const words = cleanWords(raw.words);
  if (words.some((w) => w.length > AUTOMOD_LIMITS.word))
    return { ok: false, error: `Blocked words can be ${AUTOMOD_LIMITS.word} characters each.` };
  const wordLimit = ent["automod.words"];
  if (words.length > WORDS_HARD_MAX)
    return { ok: false, error: `Up to ${WORDS_HARD_MAX} blocked words.` };
  if (words.length > wordLimit && words.length > before.words.length)
    return {
      ok: false,
      error: `Free servers block ${wordLimit} words. Garrison Pro blocks up to ${WORDS_HARD_MAX}.`,
    };
  const num = (k: string, min: number, max: number, label: string): number | string => {
    const n = Number(raw[k]);
    return Number.isInteger(n) && n >= min && n <= max ? n : `${label} goes from ${min} to ${max}.`;
  };
  const mentionLimit = num("mentionLimit", 0, AUTOMOD_LIMITS.mentionLimit, "The mention limit");
  const spamCount = num("spamCount", 0, AUTOMOD_LIMITS.spamCount, "The spam count");
  const spamSeconds = num("spamSeconds", 2, AUTOMOD_LIMITS.spamSeconds, "The spam window");
  const timeoutMinutes = num("timeoutMinutes", 1, AUTOMOD_LIMITS.timeoutMinutes, "The timeout");
  for (const v of [mentionLimit, spamCount, spamSeconds, timeoutMinutes])
    if (typeof v === "string") return { ok: false, error: v };
  if (!isAction(raw.action))
    return { ok: false, error: "Pick what happens after a message is removed." };
  const exemptRoleIds = ids(raw.exemptRoleIds);
  const exemptChannelIds = ids(raw.exemptChannelIds);
  if (
    exemptRoleIds.length > AUTOMOD_LIMITS.exempt ||
    exemptChannelIds.length > AUTOMOD_LIMITS.exempt
  )
    return { ok: false, error: `Exempt up to ${AUTOMOD_LIMITS.exempt} roles and channels.` };
  const aiEnabled = raw.aiEnabled === true;
  if (aiEnabled && !ent["automod.ai"] && !before.aiEnabled)
    return { ok: false, error: "AI moderation is part of Garrison Pro." };
  const aiCategories = Array.isArray(raw.aiCategories)
    ? [...new Set(raw.aiCategories.filter(isCategory))]
    : [];
  if (aiEnabled && !aiCategories.length)
    return { ok: false, error: "Pick at least one thing for AI moderation to look for." };
  return {
    ok: true,
    value: {
      enabled: raw.enabled === true,
      invites: raw.invites === true,
      mentionLimit: mentionLimit as number,
      spamCount: spamCount as number,
      spamSeconds: spamSeconds as number,
      words,
      action: raw.action,
      timeoutMinutes: timeoutMinutes as number,
      exemptRoleIds,
      exemptChannelIds,
      aiEnabled,
      aiCategories,
      aiStrictness: isStrictness(raw.aiStrictness) ? raw.aiStrictness : "medium",
    },
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Zero-width and look-alike tricks people use to dodge word filters. */
const normalise = (text: string) => text.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "").toLowerCase();

export const INVITE = /(?:discord(?:app)?\.com\/invite|discord\.gg)\/([\w-]{2,32})/gi;

export type RuleHit =
  | { rule: "word"; detail: string }
  | { rule: "invite"; detail: string }
  | { rule: "mentions"; detail: string };

/**
 * The first rule a message breaks, or null. `ownInvite` says whether an invite
 * code belongs to this server (those are allowed).
 */
export function checkMessageText(
  config: Pick<AutomodConfig, "words" | "invites" | "mentionLimit">,
  msg: { text: string; mentions: number },
  ownInvite: (code: string) => boolean = () => false,
): RuleHit | null {
  const text = normalise(msg.text);
  for (const w of config.words) {
    // Whole words, so "class" doesn't trip on "ass".
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}($|[^\\p{L}\\p{N}])`, "u").test(text))
      return { rule: "word", detail: w };
  }
  if (config.invites)
    for (const m of msg.text.matchAll(INVITE)) {
      const code = m[1] ?? "";
      if (!ownInvite(code)) return { rule: "invite", detail: code };
    }
  if (config.mentionLimit > 0 && msg.mentions > config.mentionLimit)
    return { rule: "mentions", detail: String(msg.mentions) };
  return null;
}

/** Spam: more than `spamCount` messages within `spamSeconds`. `times` are this member's recent message times. */
export function isSpam(
  config: Pick<AutomodConfig, "spamCount" | "spamSeconds">,
  times: number[],
  now: number,
) {
  if (!config.spamCount) return false;
  return times.filter((t) => now - t < config.spamSeconds * 1000).length > config.spamCount;
}

/** Which of the server's categories OpenAI's scores flag, at its strictness. */
export function aiFlags(
  config: Pick<AutomodConfig, "aiCategories" | "aiStrictness">,
  scores: Record<string, number>,
): AiCategory[] {
  const min = AI_THRESHOLD[config.aiStrictness];
  return config.aiCategories.filter((c) =>
    AI_CATEGORIES[c].openai.some((k) => (scores[k] ?? 0) >= min),
  );
}

export const RULE_TEXT: Record<RuleHit["rule"] | "spam" | AiCategory, string> = {
  word: "a blocked word",
  invite: "an invite to another server",
  mentions: "too many mentions",
  spam: "sending messages too fast",
  harassment: "harassment (AI)",
  hate: "hate (AI)",
  sexual: "sexual content (AI)",
  violence: "violence (AI)",
  illicit: "illegal activity (AI)",
  selfharm: "self-harm (AI)",
};
