/**
 * Emoji in buttons, topics and the starboard: one standard emoji (🎮), or one of
 * the server's own emoji written as Discord stores it (<:raid:123…>, <a:dance:…>
 * when animated). Server emoji are Pro (`emoji.custom`). Browser-safe.
 */

import { isOneEmoji } from "./role-menus";

export const CUSTOM_EMOJI = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/;

export type ParsedEmoji =
  | { kind: "standard"; name: string }
  | { kind: "custom"; id: string; name: string; animated: boolean };

export function parseEmoji(text: string): ParsedEmoji | null {
  const m = CUSTOM_EMOJI.exec(text);
  if (m?.[2] && m[3]) return { kind: "custom", id: m[3], name: m[2], animated: m[1] === "a" };
  return isOneEmoji(text) ? { kind: "standard", name: text } : null;
}

export const isEmoji = (text: string) => parseEmoji(text) !== null;
export const isCustomEmoji = (text: string | null | undefined) =>
  Boolean(text && CUSTOM_EMOJI.test(text));

/** The server emoji's image on Discord's CDN, for previews. */
export const customEmojiUrl = (e: { id: string; animated: boolean }) =>
  `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "webp"}?size=48`;

/** How an emoji reads in a text box: server emoji as :name:, standard ones as themselves. */
export function emojiLabel(text: string | null) {
  if (!text) return "";
  const e = parseEmoji(text);
  return e?.kind === "custom" ? `:${e.name}:` : text;
}

/**
 * What someone typed, as stored: ":raid:" (or "raid") becomes that server emoji if
 * the server has one by that name; anything else is kept as typed.
 */
export function resolveEmoji(
  typed: string,
  serverEmoji: { id: string; name: string; animated: boolean }[],
): string {
  const t = typed.trim();
  const name = /^:?([A-Za-z0-9_]{2,32}):?$/.exec(t)?.[1];
  const hit = name ? serverEmoji.find((e) => e.name === name) : undefined;
  return hit ? `<${hit.animated ? "a" : ""}:${hit.name}:${hit.id}>` : t;
}

/** Server emoji newly used compared with `before`: those need Pro. */
export function newCustomEmoji(now: (string | null)[], before: (string | null)[]) {
  const had = new Set(before.filter(isCustomEmoji));
  return now.filter((e): e is string => isCustomEmoji(e) && !had.has(e as string));
}
