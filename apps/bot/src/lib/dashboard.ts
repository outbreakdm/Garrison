import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
  type InteractionReplyOptions,
} from "discord.js";
import { ephemeral } from "../commands/builders.js";

/**
 * Links from Discord to the dashboard. APP_URL is the dashboard's address,
 * the same value the dashboard itself uses. Without it (or with the
 * placeholder from the example configs) links are left out, and replies say
 * the bot doesn't know where the dashboard is.
 */

type Env = Record<string, string | undefined>;

/** The dashboard's address without a trailing slash, or null when it isn't set. */
export function dashboardBase(env: Env = process.env): string | null {
  const base = (env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) return null;
  return /(^|\.)example\.com/i.test(new URL(base).hostname) ? null : base;
}

/**
 * A page of this server's dashboard. `page` is a path under /servers/:id and
 * may carry a query and an #anchor, e.g. "watch?edit=settings#settings".
 */
export function serverUrl(guildId: string, page = "", env: Env = process.env): string | null {
  const base = dashboardBase(env);
  if (!base || !/^\d{17,20}$/.test(guildId)) return null;
  const tail = !page ? "" : /^[#?]/.test(page) ? page : `/${page}`;
  return `${base}/servers/${guildId}${tail}`;
}

/** A row with one link button. Link buttons open the browser; nothing comes back to the bot. */
export function linkRow(url: string, label: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label),
  );
}

export const NO_DASHBOARD =
  "This bot doesn't know the dashboard's address yet. Whoever runs Garrison sets it as APP_URL.";

/**
 * What a settings command replies now: the current values, if it has them,
 * and a button to the page that changes them. Discord no longer changes
 * settings; the dashboard keeps every change in history, with undo.
 */
export function settingsReply(opts: {
  /** What's changed there, e.g. "Watch settings are". */
  subject: string;
  url: string | null;
  label: string;
  embed?: EmbedBuilder;
  /** Shown when the command's own permission isn't Manage Server. */
  note?: string;
}): InteractionReplyOptions & typeof ephemeral {
  const lead = `${opts.subject} changed on the dashboard now, where every change is kept in history and can be undone.`;
  return {
    content: [lead, opts.url ? opts.note : NO_DASHBOARD].filter(Boolean).join(" "),
    embeds: opts.embed ? [opts.embed] : [],
    components: opts.url ? [linkRow(opts.url, opts.label)] : [],
    ...ephemeral,
  };
}
