import { type EmbedKind, embedColors, type ModuleKey, modules } from "@garrison/brand";
import { EmbedBuilder } from "discord.js";

export type { EmbedKind };

export interface BrandEmbedInput {
  /**
   * Which of the three kinds this is. Leave it out for most embeds: neutral has
   * no colour. "done" (green) confirms that what was asked for happened.
   * "danger" (red) is an error, or confirms something severe or hard to undo.
   */
  kind?: EmbedKind;
  /** Short, sentence case, no full stop. Titles don't render mentions: put those in the text. */
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  /** Footer for records: module name plus a short ID, e.g. "Watch · case #1042". Never "Powered by". */
  module?: ModuleKey;
  ref?: string;
  timestamp?: Date;
}

/**
 * Every embed Garrison sends is built here, so they all look alike: a title
 * that says what this is, the text, fields only for facts worth scanning, and
 * a footer only on records that have an ID.
 */
export function brandEmbed(input: BrandEmbedInput): EmbedBuilder {
  const embed = new EmbedBuilder();
  const kind = input.kind ?? "neutral";
  if (kind !== "neutral") embed.setColor(embedColors[kind]);
  if (input.title) embed.setTitle(input.title);
  if (input.description) embed.setDescription(input.description);
  if (input.fields?.length) embed.addFields(input.fields);
  const footer = [input.module ? modules[input.module].name : null, input.ref].filter(Boolean);
  if (footer.length) embed.setFooter({ text: footer.join(" · ") });
  if (input.timestamp) embed.setTimestamp(input.timestamp);
  return embed;
}

/**
 * One-line replies, as a message payload. Add `...ephemeral` for a private
 * reply; pass as is to editReply. `content: ""` clears any text the message
 * had before, so these are safe to use when editing a message in place.
 */
const line = (kind: EmbedKind, text: string) => ({
  content: "",
  embeds: [brandEmbed({ kind, description: text })],
});

/** Something to know: no colour. */
export const info = (text: string) => line("neutral", text);
/** It worked: green. */
export const done = (text: string) => line("done", text);
/** It didn't happen, and why: red. */
export const failed = (text: string) => line("danger", text);
