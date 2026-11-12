import { parseEmoji } from "@garrison/db";

/** A stored emoji as discord.js wants it on a button or dropdown option. */
export function componentEmoji(text: string) {
  const e = parseEmoji(text);
  if (!e) return null;
  return e.kind === "custom" ? { id: e.id, name: e.name, animated: e.animated } : { name: e.name };
}
