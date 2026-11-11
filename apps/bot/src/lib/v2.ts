import {
  type APIEmbed,
  ComponentType,
  type Message,
  MessageFlags,
  MessageFlagsBitField,
} from "discord.js";

/**
 * Every message Garrison sends uses Discord's layout components ("Components
 * V2"): each card is a container with a heading, text and its buttons inside,
 * instead of a classic embed with buttons underneath.
 *
 * The rest of the bot still describes a message the familiar way (`content`,
 * `embeds` from brandEmbed, `components` with button rows), and this turns it
 * into the new layout just before it goes out:
 *
 * - each embed becomes a container: its colour as the container's accent (so
 *   the three kinds still read the same), the title as a heading, the text,
 *   each field as a bold label over its value, and the footer in small print;
 * - `content` becomes a line of text above the cards. Only mentions that have
 *   to ping are ever sent as content, and in this layout they still ping
 *   (allowedMentions decides who);
 * - button rows go inside the last card.
 *
 * Interaction replies are converted in interactions.ts; channel sends and
 * edits call toV2 where they happen.
 */

type Json = Record<string, unknown>;

const isJson = (v: unknown): v is Json => typeof v === "object" && v !== null;
const json = (v: unknown): Json =>
  isJson(v) && typeof (v as { toJSON?: unknown }).toJSON === "function"
    ? ((v as { toJSON(): Json }).toJSON() as Json)
    : (v as Json);

const text = (content: string) => ({ type: ComponentType.TextDisplay, content });

/** One embed, as a container. */
export function embedToContainer(embed: APIEmbed, rows: Json[] = []): Json {
  const children: Json[] = [];
  if (embed.title) children.push(text(`### ${embed.title}`));
  if (embed.description) children.push(text(embed.description));
  if (embed.fields?.length)
    children.push(text(embed.fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n")));
  const small = [
    embed.footer?.text,
    embed.timestamp ? `<t:${Math.floor(new Date(embed.timestamp).getTime() / 1000)}:f>` : null,
  ].filter(Boolean);
  if (small.length) children.push(text(`-# ${small.join(" · ")}`));
  if (!children.length) children.push(text("​"));
  if (rows.length) children.push(...rows);
  return {
    type: ComponentType.Container,
    ...(embed.color !== undefined ? { accent_color: embed.color } : {}),
    components: children,
  };
}

/**
 * A message payload in the new layout. `edit` marks an edit of a message that
 * may still be in the old format: its text and embeds are cleared, which
 * Discord needs before it takes the new layout.
 */
// biome-ignore lint/suspicious/noExplicitAny: payloads for reply, edit and send differ only in fields this passes through
export function toV2(payload: unknown, opts: { edit?: boolean } = {}): any {
  const p: Json = typeof payload === "string" ? { content: payload } : { ...(payload as Json) };
  const flags = new MessageFlagsBitField(
    (p.flags as MessageFlagsBitField["bitfield"] | undefined) ?? 0,
  );
  // Already in the new layout: leave it alone.
  if (flags.has(MessageFlags.IsComponentsV2)) return p;

  const embeds = ((p.embeds as unknown[] | undefined) ?? []).map(json) as APIEmbed[];
  const rows = ((p.components as unknown[] | undefined) ?? []).map(json);
  const content = typeof p.content === "string" ? p.content.trim() : "";

  // Nothing to show (a bare flags change, say): pass it through.
  // Swapping only the buttons of a card goes through withRows instead.
  if (!embeds.length && !content && !rows.length) return p;

  const components: Json[] = [];
  if (content) components.push(text(content));
  for (const [i, e] of embeds.entries())
    components.push(embedToContainer(e, i === embeds.length - 1 ? rows : []));
  if (!embeds.length) components.push(...rows);

  const { content: _c, embeds: _e, ...rest } = p;
  return {
    ...rest,
    ...(opts.edit ? { content: null, embeds: [] } : {}),
    components,
    flags: flags.add(MessageFlags.IsComponentsV2).bitfield,
  };
}

/**
 * The same card with different buttons: for an edit that only swaps buttons
 * (a disabled "Roles restored", say), since in this layout the buttons live
 * inside the card and sending rows alone would replace the whole message.
 */
export function withRows(message: Pick<Message, "components" | "embeds">, rows: unknown[]) {
  const newRows = rows.map(json);
  // A message from before the switch: rebuild it from its embeds.
  if (message.embeds.length)
    return toV2(
      { embeds: message.embeds.map((e) => e.toJSON()), components: newRows },
      { edit: true },
    );
  const top = message.components.map(json).filter((c) => c.type !== ComponentType.ActionRow);
  const last = top.map((c) => c.type).lastIndexOf(ComponentType.Container);
  const components = top.map((c, i) =>
    i === last
      ? {
          ...c,
          components: [
            ...((c.components as Json[]) ?? []).filter((k) => k.type !== ComponentType.ActionRow),
            ...newRows,
          ],
        }
      : c,
  );
  if (last < 0) components.push(...newRows);
  return { components, flags: MessageFlags.IsComponentsV2 };
}
