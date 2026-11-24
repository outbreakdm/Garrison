/**
 * Panels: a card Garrison posts whose buttons open Discord's forms (the suggestions panel, the
 * LFG panel). What every panel shares: the limits and checks for its words, and where it's
 * posted, so it can be moved under new posts or taken down. Pure and shared.
 */

import type { Parsed } from "./rally";

export const PANEL_LIMITS = { title: 100, body: 1000, button: 40 } as const;

/** Where a posted panel is. */
export interface PanelPlace {
  channelId: string;
  messageId: string;
}

/**
 * A panel's line of text, checked: trimmed, within `max`. Empty, or the same as the standard
 * text, is null, so the panel follows the standard if it changes.
 */
export function panelText(
  v: unknown,
  max: number,
  what: string,
  standard: string,
): Parsed<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: `${what} is text.` };
  const t = v.trim().replace(/\r\n/g, "\n");
  if (t.length > max) return { ok: false, error: `${what} holds ${max} characters.` };
  return { ok: true, value: t && t !== standard ? t : null };
}

/** A stored line of a panel's text, read leniently. */
export const readPanelText = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\r\n/g, "\n").slice(0, max) : null;
