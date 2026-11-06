import { type EmbedTone, embedColors, type ModuleKey, modules } from "@garrison/brand";
import { EmbedBuilder } from "discord.js";

export interface BrandEmbedInput {
  tone?: EmbedTone;
  title: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  /** Footer: module name plus a short ID, e.g. "Watch · case #1042". Never "Powered by". */
  module?: ModuleKey;
  ref?: string;
  timestamp?: Date;
}

/** Build an embed that follows the Garrison spec: 4 px colour bar, sentence-case title, mono-style footer. */
export function brandEmbed(input: BrandEmbedInput): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(embedColors[input.tone ?? "volt"])
    .setTitle(input.title);
  if (input.description) embed.setDescription(input.description);
  if (input.fields?.length) embed.addFields(input.fields);
  const footer = [input.module ? modules[input.module].name : null, input.ref].filter(Boolean);
  if (footer.length) embed.setFooter({ text: footer.join(" · ") });
  if (input.timestamp) embed.setTimestamp(input.timestamp);
  return embed;
}
