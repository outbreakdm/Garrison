import type { PanelPlace } from "@garrison/db";
import type { Guild, MessageCreateOptions, SendableChannels } from "discord.js";

/**
 * Panels (the suggestions panel, the LFG panel): a card whose buttons open Discord's forms.
 * What every panel's bot side shares: posting it (and taking the old one down), and moving it
 * under new posts one move at a time, so two posts at once never leave two panels.
 */

/**
 * Post the panel in `channel`, then take the old one down wherever it was. Posting first means
 * a failed post leaves the old panel up.
 */
export async function placePanel(
  guild: Guild,
  channel: SendableChannels,
  message: MessageCreateOptions,
  old: Partial<PanelPlace> | null,
): Promise<PanelPlace> {
  const sent = await channel.send(message);
  if (old?.channelId && old.messageId) {
    const before = guild.channels.cache.get(old.channelId);
    if (before?.isTextBased()) await before.messages.delete(old.messageId).catch(() => null);
  }
  return { channelId: channel.id, messageId: sent.id };
}

const moving = new Map<string, Promise<unknown>>();

/**
 * Run one panel move at a time per `key` (a module and a server). Each move should read where
 * the panel is inside `run`: the move before it changed that.
 */
export function queuePanelMove(key: string, run: () => Promise<void>) {
  const next = (moving.get(key) ?? Promise.resolve()).then(run, run);
  moving.set(key, next);
  return next.finally(() => {
    if (moving.get(key) === next) moving.delete(key);
  });
}
