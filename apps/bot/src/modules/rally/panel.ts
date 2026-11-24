import {
  getLfgPanel,
  LFG_PANEL,
  type LfgPanelConfig,
  lfgPanelTemplates,
  lfgPanelWords,
  parseSlots,
  type RallyTemplate,
  setLfgPanelMessage,
} from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  type SendableChannels,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { placePanel, queuePanelMove } from "../../lib/panels.js";
import { cachedTemplates } from "./templates.js";

/**
 * The "Find a group" panel: a card in an LFG channel with a button per template and one for
 * anything else. A button opens a short form asking only what its template doesn't set (what
 * you're running, your role, when, a note) and the group goes up in the panel's channel the
 * way /lfg create posts it. With "stays at the bottom" on, the panel follows the groups.
 */

export const LFG_PANEL_PREFIX = "lfgpanel";
export const LFG_FORM_PREFIX = "lfgform";
/** The button and form for a group no template fits. */
export const LFG_OTHER = "other";

export const LFG_TITLE_MAX = 80;
export const LFG_NOTE_MAX = 120;

/** The panel members see: the server's words and a button per template it shows. */
export function lfgPanelMessage(config: LfgPanelConfig, shown: RallyTemplate[]) {
  const words = lfgPanelWords(config);
  return cardMessage({
    tone: "volt",
    title: words.title,
    blocks: words.body ? [{ text: words.body }] : [],
    actions: [
      ...shown.map((t) =>
        new ButtonBuilder()
          .setCustomId(`${LFG_PANEL_PREFIX}:t:${t.id}`)
          .setLabel(t.name.slice(0, 80))
          .setStyle(ButtonStyle.Primary),
      ),
      ...(config.lfgPanelOther
        ? [
            new ButtonBuilder()
              .setCustomId(`${LFG_PANEL_PREFIX}:${LFG_OTHER}`)
              .setLabel(LFG_PANEL.other)
              .setStyle(ButtonStyle.Secondary),
          ]
        : []),
    ],
    module: "rally",
  });
}

/** A template's role choices, when it lists named roles (Tank, Healer, DPS). */
export function templateRoles(template: Pick<RallyTemplate, "roles" | "size">): string[] {
  const slots = parseSlots(template.roles, template.size);
  return slots.ok ? slots.value.map((g) => g.name).filter(Boolean) : [];
}

/**
 * Discord's form for a group. From a template: what you're running (the template's name to
 * start), your role when it lists roles, when it starts and a note. "Something else" asks how
 * many players (or which roles) instead of a role.
 */
export function lfgForm(template: RallyTemplate | null) {
  const title = new TextInputBuilder()
    .setCustomId("title")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(LFG_TITLE_MAX)
    .setPlaceholder("Mythic+ 12 · Ara-Kara")
    .setRequired(true);
  if (template) title.setValue(template.name.slice(0, LFG_TITLE_MAX));
  const labels = [
    new LabelBuilder().setLabel("What are you running?").setTextInputComponent(title),
  ];
  const roles = template ? templateRoles(template) : [];
  if (roles.length > 1)
    labels.push(
      new LabelBuilder().setLabel("Your role").setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("role")
          .setRequired(true)
          .addOptions(roles.slice(0, 25).map((r) => ({ label: r.slice(0, 100), value: r }))),
      ),
    );
  if (!template)
    labels.push(
      new LabelBuilder()
        .setLabel("How many players?")
        .setDescription("A number with you included, or roles: Tank 1, Healer 1, DPS 3")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("slots")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(120)
            .setPlaceholder("5")
            .setRequired(false),
        ),
    );
  labels.push(
    new LabelBuilder()
      .setLabel("When does it start?")
      .setDescription("Leave it empty for now, or say how long from now")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("starts")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(16)
          .setPlaceholder("30m")
          .setRequired(false),
      ),
    new LabelBuilder()
      .setLabel("Anything to know?")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("note")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(LFG_NOTE_MAX)
          .setPlaceholder("Rank Gold+, mic on")
          .setRequired(false),
      ),
  );
  return new ModalBuilder()
    .setCustomId(`${LFG_FORM_PREFIX}:${template ? `t:${template.id}` : LFG_OTHER}`)
    .setTitle((template?.name ?? "Find a group").slice(0, 45))
    .addLabelComponents(...labels);
}

/** Post the panel in `channel` with the buttons it may show there, and record where it is. */
async function postLfgPanelIn(
  ctx: BotContext,
  guild: Guild,
  config: LfgPanelConfig,
  channel: SendableChannels & { id: string },
) {
  const { templates } = await cachedTemplates(ctx, guild.id);
  const shown = lfgPanelTemplates(config, templates, channel.id);
  if (!shown.length && !config.lfgPanelOther) return null;
  const at = await placePanel(guild, channel, lfgPanelMessage(config, shown), {
    channelId: config.lfgPanelChannelId ?? undefined,
    messageId: config.lfgPanelMessageId ?? undefined,
  });
  await setLfgPanelMessage(ctx.db, guild.id, at);
  return at;
}

/**
 * A group just went up in `channelId`: if the panel lives there and follows the groups, post it
 * again under it. Never fails the post: a panel that can't move stays where it is.
 */
export async function keepLfgPanelLast(ctx: BotContext, guild: Guild, channelId: string) {
  await queuePanelMove(`lfg:${guild.id}`, async () => {
    const config = await getLfgPanel(ctx.db, guild.id);
    if (!config.lfgPanelSticky || config.lfgPanelChannelId !== channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isSendable() || !channel.isTextBased()) return;
    await postLfgPanelIn(ctx, guild, config, channel);
  }).catch((error: unknown) =>
    ctx.logger.warn("Could not move the LFG panel", { guildId: guild.id, error }),
  );
}

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });
const postPanel = z.object({ channelId: z.string().regex(/^\d{17,20}$/) });

/**
 * Dashboard (or the AI assistant) request: post the LFG panel. One per server: posting again
 * moves it. The same channel checks as posting any panel.
 */
export async function doPostLfgPanel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = postPanel.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");
  const config = await getLfgPanel(ctx.db, guild.id);
  const at = await postLfgPanelIn(ctx, guild, config, channel);
  if (!at)
    return fail(
      `None of the panel's templates can be posted in #${channel.name}. Pick one of their channels, or turn on "${LFG_PANEL.other}".`,
    );
  return { ok: true, message: `Posted the LFG panel in #${channel.name}.` };
}
