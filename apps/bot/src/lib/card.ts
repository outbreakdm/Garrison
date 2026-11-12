import { type EmbedTone, embedColors, type ModuleKey, modules } from "@garrison/brand";
import {
  type CustomCard,
  cardForPlan,
  type Entitlements,
  STANDARD_ACCENT,
  STANDARD_FOOTER,
} from "@garrison/db";
import {
  ActionRowBuilder,
  type APIMessageTopLevelComponent,
  type ButtonBuilder,
  ContainerBuilder,
  EmbedBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  type Message,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

/**
 * Every Garrison message, described once and drawn two ways.
 *
 * New messages use Discord's Components V2 layout: a container with the tone's
 * colour bar, a real heading, the status in bold, dividers with spacing, buttons
 * beside the line they act on, and a small grey footer. Messages posted as embeds
 * before the switch keep being edited as embeds (`legacyMessage`), because a
 * message can't change format halfway through its life.
 */

export interface CardBlock {
  /** Markdown. Mentions render but never ping. */
  text: string;
  /** A button drawn beside this text (a V2 section accessory); a row under it in embeds. */
  button?: ButtonBuilder;
}

export interface CardFact {
  label: string;
  value: string;
}

export interface Card {
  tone?: EmbedTone;
  title: string;
  /** The state in a word or two ("1 left", "Ready", "Undone"), shown bold under the title. */
  status?: string;
  /** One line under the title: who, when, where. Joined to the status with " · ". */
  lead?: string;
  /** The body, in order. "divider" draws a rule between groups. */
  blocks?: (CardBlock | "divider")[];
  /** Label and value pairs, one per line, after the blocks. */
  facts?: CardFact[];
  /** Buttons at the bottom, five to a row. */
  actions?: ButtonBuilder[];
  /** Footer: module name, a short reference and a time. Never "Powered by". */
  module?: ModuleKey;
  ref?: string;
  at?: Date;
  /** High-volume log posts: bold title instead of a heading, no rules. */
  compact?: boolean;
}

/** Discord's own timestamp markup, shown in each reader's time zone. */
export const ts = (date: Date, style: "R" | "f" | "F" | "t" = "R") =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;

/** "**Label:** value" lines; empty values are left out. */
export const factLines = (facts: CardFact[]) =>
  facts
    .filter((f) => f.value)
    .map((f) => `**${f.label}:** ${f.value}`)
    .join("\n");

/** A list capped at `max` lines, ending "+n more" when it's longer. */
export function capped(lines: string[], max: number) {
  return lines.length > max ? [...lines.slice(0, max), `+${lines.length - max} more`] : lines;
}

const TEXT_MAX = 3900; // Discord allows 4000 characters of text per message.

function footerText(card: Card) {
  const parts = [card.module ? modules[card.module].name : null, card.ref ?? null];
  if (card.at) parts.push(ts(card.at, "f"));
  const line = parts.filter(Boolean).join(" · ");
  return line ? `-# ${line}` : null;
}

function headText(card: Card) {
  const title = card.compact ? `**${card.title}**` : `### ${card.title}`;
  const sub = [card.status ? `**${card.status}**` : null, card.lead ?? null].filter(Boolean);
  return sub.length ? `${title}\n${sub.join(" · ")}` : title;
}

const rule = (divider = true) =>
  new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Small);

/** The Components V2 container for a card. */
export function cardContainer(card: Card): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(embedColors[card.tone ?? "volt"]);
  let budget = TEXT_MAX;
  const text = (s: string) => {
    const clipped = s.length > budget ? `${s.slice(0, Math.max(0, budget - 1))}…` : s;
    budget -= clipped.length;
    return new TextDisplayBuilder().setContent(clipped || "​");
  };

  container.addTextDisplayComponents(text(headText(card)));
  const body = [...(card.blocks ?? [])];
  const facts = card.facts ? factLines(card.facts) : "";
  if (facts) body.push({ text: facts });
  const hasBody = body.some((b) => b !== "divider" && b.text);
  if (hasBody && !card.compact) container.addSeparatorComponents(rule());

  for (const block of body) {
    if (block === "divider") {
      container.addSeparatorComponents(rule());
      continue;
    }
    if (!block.text) continue;
    if (block.button) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(block.text))
          .setButtonAccessory(block.button),
      );
    } else {
      container.addTextDisplayComponents(text(block.text));
    }
  }

  const actions = card.actions ?? [];
  for (let i = 0; i < actions.length; i += 5) {
    if (i === 0 && hasBody) container.addSeparatorComponents(rule(false));
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(actions.slice(i, i + 5)),
    );
  }

  const footer = footerText(card);
  if (footer) container.addTextDisplayComponents(text(footer));
  return container;
}

const QUIET = { parse: [] } as const;

/**
 * A card someone designed on the dashboard (`CustomCard`), drawn the same way the
 * editor's preview draws it: thumbnail beside the title, text and dividers, the
 * banner image, the module's own rows (a role menu's buttons), then the footer.
 * Pro values the plan lacks fall back to the standard look.
 */
export function customCardContainer(
  input: CustomCard,
  ent: Entitlements,
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [],
): ContainerBuilder {
  const card = cardForPlan(input, ent);
  const accent = Number.parseInt((card.accent ?? STANDARD_ACCENT).slice(1), 16);
  const container = new ContainerBuilder().setAccentColor(accent);
  let budget = TEXT_MAX;
  const text = (s: string) => {
    const clipped = s.length > budget ? `${s.slice(0, Math.max(0, budget - 1))}…` : s;
    budget -= clipped.length;
    return new TextDisplayBuilder().setContent(clipped || "​");
  };

  const head = `### ${card.title}`;
  if (card.thumbnail) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(head))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(card.thumbnail)),
    );
  } else {
    container.addTextDisplayComponents(text(head));
  }
  if (card.blocks.length) container.addSeparatorComponents(rule());
  for (const block of card.blocks) {
    if (block.kind === "divider") container.addSeparatorComponents(rule());
    else container.addTextDisplayComponents(text(block.text));
  }
  if (card.image)
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(card.image)),
    );
  if (rows.length) {
    container.addSeparatorComponents(rule(false));
    container.addActionRowComponents(...rows);
  }
  const footer = card.footer ?? STANDARD_FOOTER;
  if (footer) container.addTextDisplayComponents(text(`-# ${footer}`));
  return container;
}

/** A custom card as a new channel message, or the edit of one. Mentions never ping. */
export function customCardMessage(
  card: CustomCard,
  ent: Entitlements,
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [],
) {
  return {
    components: [customCardContainer(card, ent, rows)],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: QUIET,
  };
}

/** A new channel message, DM or edit of a V2 message. Mentions never ping. */
export function cardMessage(card: Card) {
  return {
    components: [cardContainer(card)],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: QUIET,
  };
}

/** An interaction reply. Ephemeral by default, like the rest of Garrison's replies. */
export function cardReply(card: Card, opts: { ephemeral?: boolean } = {}) {
  const ephemeral = opts.ephemeral ?? true;
  return {
    components: [cardContainer(card)],
    flags: ephemeral
      ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      : MessageFlags.IsComponentsV2,
    allowedMentions: QUIET,
  };
}

/** The same card as an embed, for editing messages posted before the switch to V2. */
export function legacyMessage(card: Card) {
  const embed = new EmbedBuilder()
    .setColor(embedColors[card.tone ?? "volt"])
    .setTitle(card.status ? `${card.title} · ${card.status}` : card.title);
  const description = [
    card.lead,
    ...(card.blocks ?? []).map((b) => (b === "divider" ? null : b.text)),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (description) embed.setDescription(description.slice(0, 4096));
  if (card.facts?.length)
    embed.addFields(
      card.facts
        .filter((f) => f.value)
        .slice(0, 25)
        .map((f) => ({ name: f.label, value: f.value.slice(0, 1024), inline: true })),
    );
  const footer = [card.module ? modules[card.module].name : null, card.ref].filter(Boolean);
  if (footer.length) embed.setFooter({ text: footer.join(" · ") });
  if (card.at) embed.setTimestamp(card.at);

  const buttons = [
    ...(card.blocks ?? []).flatMap((b) => (b !== "divider" && b.button ? [b.button] : [])),
    ...(card.actions ?? []),
  ];
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5)
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  return { content: "", embeds: [embed], components, allowedMentions: QUIET };
}

/** Is this message one of the old embed messages, posted before the switch to V2? */
export const isLegacy = (message: Pick<Message, "flags"> | null | undefined) =>
  Boolean(message && !message.flags.has(MessageFlags.IsComponentsV2));

/** The edit for an existing message, in whichever format that message already has. */
export const cardEdit = (message: Pick<Message, "flags"> | null | undefined, card: Card) =>
  isLegacy(message) ? legacyMessage(card) : cardMessage(card);

/** Every text a V2 payload shows, in order: for tests and previews. */
export function cardTexts(payload: { components: { toJSON(): unknown }[] }) {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: number; content?: string; label?: string; components?: unknown[] };
    if (n.type === 10 && n.content) out.push(n.content);
    if (n.type === 2 && n.label) out.push(`[${n.label}]`);
    for (const key of ["components", "accessory"] as const) {
      const child = (n as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child) walk(child);
    }
  };
  for (const c of payload.components) walk(c.toJSON());
  return out;
}

/**
 * Change one button on an existing message, in place, whatever its format:
 * used where only a button's state changes (Restore roles → Roles restored).
 */
export function patchButton(
  message: Pick<Message, "flags" | "components">,
  customId: string,
  patch: { label?: string; disabled?: boolean },
) {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const n = { ...(node as Record<string, unknown>) };
    if (n.type === 2 && n.custom_id === customId) return { ...n, ...patch };
    for (const key of ["components", "accessory"]) if (n[key]) n[key] = walk(n[key]);
    return n;
  };
  const components = message.components.map((c) =>
    walk(c.toJSON()),
  ) as APIMessageTopLevelComponent[];
  return isLegacy(message)
    ? { components }
    : { components, flags: MessageFlags.IsComponentsV2 as const, allowedMentions: QUIET };
}
