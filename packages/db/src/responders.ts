/**
 * Auto-responders and custom commands (best bot item 3), on the Messages page: Garrison
 * replies when someone says a word or a phrase, or runs `/tag` with a name. Stored beside
 * the saved messages (message_settings.responders), changed through Settings history like
 * any setting. Pure and shared: the dashboard checks a list before saving, the bot matches
 * messages against it.
 *
 * Free: 10 responders. Pro: 100. A server back on Free keeps what it made; past the limit
 * the extra ones pause (the bot uses the first ones in the list).
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export type ResponderTrigger = "word" | "phrase" | "command";

export interface Responder {
  /** Stable across edits. */
  id: string;
  /** What the dashboard lists it as. */
  name: string;
  /** word: the whole word anywhere in a message; phrase: the words in that order; command: /tag name. */
  trigger: ResponderTrigger;
  /** The word, the phrase, or the tag's name. Matched without case. */
  text: string;
  /** What Garrison says, in Discord markdown. Mentions show but never ping. */
  reply: string;
  /** Only in these channels; empty: everywhere. Not for commands. */
  channelIds: string[];
  /** The least time between two replies from it in one channel. */
  cooldownSeconds: number;
  enabled: boolean;
}

export const RESPONDER_LIMITS = {
  /** The most a server can keep, Pro included. */
  max: 100,
  name: 40,
  text: 60,
  reply: 1800,
  channels: 25,
  cooldown: 3600,
} as const;

/** A tag's name, as Discord's autocomplete shows it: letters, numbers, - and _. */
const TAG = /^[\p{L}\p{N}_-]{1,32}$/u;
const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const TRIGGERS: ResponderTrigger[] = ["word", "phrase", "command"];

export const responderLimit = (ent: Entitlements) => ent["messages.responders"];

/** A trigger's text as it's matched: trimmed, single-spaced, lower case. */
export const responderKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

const where = (r: { name?: unknown }, i: number) =>
  typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : `Responder ${i + 1}`;

/** One responder, or why it isn't one. */
export function parseResponder(raw: unknown, i = 0): Parsed<Responder> {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: `Responder ${i + 1} isn't valid.` };
  const r = raw as Record<string, unknown>;
  const name = where(r, i);
  if (typeof r.id !== "string" || !ID.test(r.id))
    return { ok: false, error: `${name} has no valid ID. Refresh and try again.` };
  if (typeof r.name !== "string" || !r.name.trim())
    return { ok: false, error: `Responder ${i + 1} needs a name.` };
  if (r.name.trim().length > RESPONDER_LIMITS.name)
    return { ok: false, error: `Names hold ${RESPONDER_LIMITS.name} characters.` };
  const trigger = TRIGGERS.find((t) => t === r.trigger);
  if (!trigger) return { ok: false, error: `${name}: pick a word, a phrase or a command.` };
  const text = typeof r.text === "string" ? r.text.trim().replace(/\s+/g, " ") : "";
  if (!text) return { ok: false, error: `${name}: say what sets it off.` };
  if (text.length > RESPONDER_LIMITS.text)
    return { ok: false, error: `${name}: triggers hold ${RESPONDER_LIMITS.text} characters.` };
  if (trigger === "word" && /\s/.test(text))
    return { ok: false, error: `${name}: a word trigger is one word; use a phrase for more.` };
  if (trigger === "command" && !TAG.test(text))
    return {
      ok: false,
      error: `${name}: a tag's name is one word of letters, numbers, - and _ (32 at most).`,
    };
  const reply = typeof r.reply === "string" ? r.reply.trim().replace(/\r\n/g, "\n") : "";
  if (!reply) return { ok: false, error: `${name}: write what Garrison says.` };
  if (reply.length > RESPONDER_LIMITS.reply)
    return { ok: false, error: `${name}: replies hold ${RESPONDER_LIMITS.reply} characters.` };
  if (/@(everyone|here)\b/.test(reply))
    return { ok: false, error: `${name}: replies can't mention @everyone or @here.` };
  const channelIds = Array.isArray(r.channelIds)
    ? [...new Set(r.channelIds.map(String).filter(Boolean))]
    : [];
  if (!channelIds.every((c) => SNOWFLAKE.test(c)))
    return { ok: false, error: `${name}: pick channels from this server's list.` };
  if (channelIds.length > RESPONDER_LIMITS.channels)
    return { ok: false, error: `${name}: up to ${RESPONDER_LIMITS.channels} channels.` };
  const cooldown = Number(r.cooldownSeconds ?? 30);
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > RESPONDER_LIMITS.cooldown)
    return { ok: false, error: `${name}: the cooldown goes from 0 to 3,600 seconds.` };
  return {
    ok: true,
    value: {
      id: r.id,
      name: r.name.trim(),
      trigger,
      text,
      reply,
      channelIds: trigger === "command" ? [] : channelIds,
      cooldownSeconds: cooldown,
      enabled: r.enabled !== false,
    },
  };
}

/**
 * A server's whole list, as the dashboard saves it. `before` is what's saved: a server back
 * on Free keeps responders it made on Pro, but adds none past the Free limit.
 */
export function checkResponders(
  raw: unknown,
  ent: Entitlements,
  before: Responder[] = [],
): Parsed<Responder[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Responders must be a list." };
  if (raw.length > RESPONDER_LIMITS.max)
    return { ok: false, error: `A server can have ${RESPONDER_LIMITS.max} responders.` };
  const limit = responderLimit(ent);
  if (raw.length > limit && raw.length > before.length)
    return {
      ok: false,
      error: `Free servers can have ${limit} responders. Garrison Pro allows ${RESPONDER_LIMITS.max}.`,
    };
  const out: Responder[] = [];
  for (const [i, x] of raw.entries()) {
    const r = parseResponder(x, i);
    if (!r.ok) return r;
    if (out.some((o) => o.id === r.value.id))
      return { ok: false, error: "Two responders share an ID. Refresh and try again." };
    const key = responderKey(r.value.text);
    const twin = out.find(
      (o) =>
        (o.trigger === "command") === (r.value.trigger === "command") &&
        responderKey(o.text) === key,
    );
    if (twin)
      return {
        ok: false,
        error:
          r.value.trigger === "command"
            ? `Two tags are called ${r.value.text}.`
            : `${twin.name} and ${r.value.name} both answer "${r.value.text}".`,
      };
    out.push(r.value);
  }
  return { ok: true, value: out };
}

/** A stored list, read leniently: one that doesn't make sense is left out. */
export function readResponders(raw: unknown): Responder[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x, i) => {
    const r = parseResponder(x, i);
    return r.ok ? [r.value] : [];
  });
}

/** The ones working on this plan: on, and within its limit (the first ones in the list). */
export const activeResponders = (list: Responder[], ent: Entitlements) =>
  list.filter((r) => r.enabled).slice(0, responderLimit(ent));

/** Letters and numbers, so "gg!" and "GG" are the same word. */
const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * The responder a message sets off, or null: the first word or phrase one in the list whose
 * text it contains, in a channel it's allowed in. Commands are only for /tag.
 */
export function matchResponder(
  list: Responder[],
  message: { text: string; channelId: string; parentId?: string | null },
): Responder | null {
  const words = wordsOf(message.text);
  if (!words.length) return null;
  const joined = ` ${words.join(" ")} `;
  for (const r of list) {
    if (r.trigger === "command") continue;
    if (
      r.channelIds.length &&
      !r.channelIds.includes(message.channelId) &&
      !(message.parentId && r.channelIds.includes(message.parentId))
    )
      continue;
    const want = wordsOf(r.text);
    if (!want.length) continue;
    if (
      r.trigger === "word"
        ? words.includes(want[0] as string)
        : joined.includes(` ${want.join(" ")} `)
    )
      return r;
  }
  return null;
}

/** A tag by its name, for /tag. */
export const findTag = (list: Responder[], name: string) =>
  list.find((r) => r.trigger === "command" && responderKey(r.text) === responderKey(name)) ?? null;
