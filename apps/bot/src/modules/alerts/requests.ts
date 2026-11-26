import {
  ALERT_PROVIDERS,
  applySettingsChange,
  checkAlertFeeds,
  checkStreamRequest,
  createStreamRequest,
  decideStreamRequest,
  entitlements,
  getAlertFeeds,
  getGuildPlan,
  getStreamRequest,
  getStreamRequests,
  newId,
  pruneStreamRequests,
  readAlertFeeds,
  reopenStreamRequest,
  STREAM_PANEL,
  STREAM_REQUEST_LIMITS,
  STREAM_REQUEST_PROVIDERS,
  STREAM_REQUESTS_DAYS,
  type StreamRequest,
  type StreamRequestsConfig,
  setStreamPanelMessage,
  setStreamRequestCard,
  streamPanelWords,
  streamUrl,
} from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { z } from "zod";
import { ephemeral } from "../../commands/builders.js";
import type { BotContext, ButtonHandler, ModalHandler } from "../../commands/types.js";
import { cardMessage, notice, ts } from "../../lib/card.js";
import { placePanel } from "../../lib/panels.js";
import { safeText } from "../../lib/text.js";

/**
 * Members asking for their stream to be announced. The request panel's button opens a short
 * form (the platform, their channel, a note); the request goes to staff as a card with Approve
 * and Decline (and to the Stream alerts page). Approving adds the stream to the server's alerts
 * through the same settings change the dashboard makes (history and undo), with the server's
 * channel and ping, within the plan's alert limit. The member hears back by DM.
 */

export const STREAM_PANEL_PREFIX = "streampanel";
export const STREAM_FORM_PREFIX = "streamform";
export const STREAM_DECIDE_PREFIX = "streamreq";

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });
const CLOSED = "Stream requests aren't open in this server right now.";

/** The panel members see: the server's words and the button that opens the form. */
export function streamPanelMessage(config: StreamRequestsConfig) {
  const words = streamPanelWords(config);
  return cardMessage({
    tone: "volt",
    title: words.title,
    blocks: words.body ? [{ text: words.body }] : [],
    actions: [
      new ButtonBuilder()
        .setCustomId(`${STREAM_PANEL_PREFIX}:open`)
        .setLabel(STREAM_PANEL.button)
        .setStyle(ButtonStyle.Primary),
    ],
    module: "beacon",
  });
}

/** Discord's form: the platform from a list, their channel, and a note for staff. */
export function streamForm() {
  return new ModalBuilder()
    .setCustomId(`${STREAM_FORM_PREFIX}:submit`)
    .setTitle(STREAM_PANEL.button)
    .addLabelComponents(
      new LabelBuilder().setLabel("Where you stream").setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("provider")
          .setRequired(true)
          .addOptions(
            STREAM_REQUEST_PROVIDERS.map((p) => ({ label: ALERT_PROVIDERS[p].label, value: p })),
          ),
      ),
      new LabelBuilder()
        .setLabel("Your channel")
        .setDescription("Your username, @handle or a link to your channel")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("handle")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(120)
            .setRequired(true),
        ),
      new LabelBuilder()
        .setLabel("Anything staff should know?")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("note")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(STREAM_REQUEST_LIMITS.note)
            .setRequired(false),
        ),
    );
}

/** The staff card: who asked, for which channel (a link to look first), and the decision. */
export function streamRequestCard(r: StreamRequest) {
  const waiting = r.status === "waiting";
  const provider = r.provider as (typeof STREAM_REQUEST_PROVIDERS)[number];
  const url = streamUrl(provider, r.handle);
  return cardMessage({
    tone: waiting ? "caution" : r.status === "approved" ? "go" : "alert",
    title: "Stream request",
    status: waiting
      ? "Waiting for staff"
      : r.status === "approved"
        ? `Added by ${r.decidedBy ?? "staff"}`
        : `Declined by ${r.decidedBy ?? "staff"}`,
    lead: `<@${r.userId}> · ${ts(r.createdAt)}`,
    facts: [
      { label: "Where", value: ALERT_PROVIDERS[provider]?.label ?? r.provider },
      { label: "Channel", value: url ? `[${safeText(r.handle)}](${url})` : safeText(r.handle) },
      ...(r.note ? [{ label: "Note", value: safeText(r.note) }] : []),
    ],
    actions: waiting
      ? [
          new ButtonBuilder()
            .setCustomId(`${STREAM_DECIDE_PREFIX}:approve:${r.id}`)
            .setLabel("Add their alerts")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${STREAM_DECIDE_PREFIX}:decline:${r.id}`)
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger),
        ]
      : [],
    module: "beacon",
    ref: `request ${r.id.slice(0, 6)}`,
  });
}

/** A request from the form: checked, stored, and sent to staff. */
export async function receiveStreamRequest(
  ctx: BotContext,
  member: GuildMember,
  given: { provider: string | null; handle: string; note: string },
): Promise<Outcome> {
  const guild = member.guild;
  const config = await getStreamRequests(ctx.db, guild.id);
  if (!config.requestsEnabled || !config.requestReviewChannelId) return fail(CLOSED);
  const checked = checkStreamRequest(given);
  if (!checked.ok) return fail(checked.error);
  const { provider, handle, note } = checked.value;
  const feeds = readAlertFeeds(await getAlertFeeds(ctx.db, guild.id));
  if (feeds.some((f) => f.provider === provider && f.handle.toLowerCase() === handle.toLowerCase()))
    return { ok: true, message: `${handle} is announced here already.` };
  const row = await createStreamRequest(ctx.db, {
    guildId: guild.id,
    userId: member.id,
    username: member.user.username,
    provider,
    handle,
    note,
  });
  if (!row)
    return { ok: true, message: "Your request is with staff already. You'll hear back by DM." };
  const channel = guild.channels.cache.get(config.requestReviewChannelId);
  if (channel?.isSendable()) {
    const sent = await channel.send(streamRequestCard(row)).catch((error: unknown) => {
      ctx.logger.warn("Could not post a stream request", { guildId: guild.id, error });
      return null;
    });
    if (sent)
      await setStreamRequestCard(ctx.db, row.id, { channelId: channel.id, messageId: sent.id });
  }
  return { ok: true, message: "Sent to staff. You'll hear back by DM when they decide." };
}

/**
 * Staff approve or decline, from the card or the dashboard. Approving adds the stream to the
 * alerts (checked against the plan's limit first); only one decision lands.
 */
export async function decideOnStreamRequest(
  ctx: BotContext,
  guild: Guild,
  id: string,
  approve: boolean,
  actor: { id: string; name: string },
): Promise<Outcome> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("That request isn't here.");
  const row = await getStreamRequest(ctx.db, guild.id, id);
  if (row?.status !== "waiting") return fail("Someone already decided on this request.");
  let feeds: ReturnType<typeof checkAlertFeeds> | null = null;
  if (approve) {
    const config = await getStreamRequests(ctx.db, guild.id);
    if (!config.requestAlertChannelId)
      return fail("Pick the channel approved streams are announced in first (Stream alerts).");
    const [raw, plan] = await Promise.all([
      getAlertFeeds(ctx.db, guild.id),
      getGuildPlan(ctx.db, guild.id),
    ]);
    const before = readAlertFeeds(raw);
    feeds = checkAlertFeeds(
      [
        ...before,
        {
          id: newId(),
          provider: row.provider,
          handle: row.handle,
          channelId: config.requestAlertChannelId,
          roleId: config.requestRoleId,
          message: null,
          accent: null,
        },
      ],
      entitlements(plan),
      before,
    );
    if (!feeds.ok) return fail(feeds.error);
  }
  const decided = await decideStreamRequest(ctx.db, guild.id, id, {
    status: approve ? "approved" : "declined",
    decidedBy: actor.name,
  });
  if (!decided) return fail("Someone already decided on this request.");
  if (feeds?.ok) {
    const saved = await applySettingsChange(ctx.db, {
      guildId: guild.id,
      module: "alerts",
      patch: { feeds: feeds.value },
      userId: actor.id,
      username: actor.name,
    }).catch(() => null);
    if (!saved?.ok) {
      await reopenStreamRequest(ctx.db, id);
      return fail("The alert couldn't be added, so the request is still waiting. Try again.");
    }
  }
  const member = await guild.members.fetch(decided.userId).catch(() => null);
  await member
    ?.send(
      approve
        ? `Your stream (${decided.handle}) is in ${guild.name}'s stream alerts now.`
        : `${guild.name}'s staff didn't add your stream (${decided.handle}) this time.`,
    )
    .catch(() => null);
  if (decided.channelId && decided.messageId) {
    const channel = guild.channels.cache.get(decided.channelId);
    if (channel?.isTextBased())
      await channel.messages.edit(decided.messageId, streamRequestCard(decided)).catch(() => null);
  }
  return {
    ok: true,
    message: approve
      ? `Added ${decided.handle} to the stream alerts.`
      : `Declined ${decided.username}'s request.`,
  };
}

const postPanel = z.object({ channelId: z.string().regex(/^\d{17,20}$/) });
const decide = z.object({ id: z.string().uuid(), approve: z.boolean() });

/** Dashboard (or the AI assistant) request: post the request panel. One per server. */
export async function doPostStreamPanel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = postPanel.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const config = await getStreamRequests(ctx.db, guild.id);
  if (!config.requestsEnabled) return fail("Turn member requests on first (Stream alerts).");
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");
  const at = await placePanel(guild, channel, streamPanelMessage(config), {
    channelId: config.requestPanelChannelId ?? undefined,
    messageId: config.requestPanelMessageId ?? undefined,
  });
  await setStreamPanelMessage(ctx.db, guild.id, at);
  return { ok: true, message: `Posted the stream request panel in #${channel.name}.` };
}

/** Dashboard request: approve or decline. */
export async function doStreamRequestDecide(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = decide.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  return decideOnStreamRequest(ctx, guild, p.data.id, p.data.approve, {
    id: member.id,
    name: member.user.username,
  });
}

/** Staff on the card: Manage Server or Manage Channels. */
const isStaff = (member: GuildMember) =>
  member.permissions.has(PermissionFlagsBits.ManageGuild) ||
  member.permissions.has(PermissionFlagsBits.ManageChannels);

/** The panel's button: open the form, or say privately that requests are closed. */
export const streamPanelButtons: ButtonHandler = {
  prefix: STREAM_PANEL_PREFIX,
  async execute(interaction, ctx) {
    const config = await getStreamRequests(ctx.db, interaction.guildId);
    if (!config.requestsEnabled) {
      await interaction.reply(notice(CLOSED, "intel"));
      return;
    }
    await interaction.showModal(streamForm());
  },
};

/** The form came back. */
export const streamForms: ModalHandler = {
  prefix: STREAM_FORM_PREFIX,
  async execute(interaction, ctx) {
    const text = (key: string) => {
      try {
        return interaction.fields.getTextInputValue(key);
      } catch {
        return "";
      }
    };
    let provider: string | null = null;
    try {
      provider = interaction.fields.getStringSelectValues("provider")[0] ?? null;
    } catch {}
    await interaction.deferReply(ephemeral);
    const result = await receiveStreamRequest(ctx, interaction.member, {
      provider,
      handle: text("handle"),
      note: text("note"),
    });
    await interaction.editReply(notice(result.message, result.ok ? "go" : "caution"));
  },
};

/** Approve or Decline on the staff card. */
export const streamDecideButtons: ButtonHandler = {
  prefix: STREAM_DECIDE_PREFIX,
  async execute(interaction, ctx) {
    const [, choice, id] = interaction.customId.split(":");
    if (!isStaff(interaction.member)) {
      await interaction.reply(
        notice(
          "Only staff (Manage Server or Manage Channels) can decide on stream requests.",
          "alert",
        ),
      );
      return;
    }
    await interaction.deferReply(ephemeral);
    const result = await decideOnStreamRequest(
      ctx,
      interaction.guild,
      id ?? "",
      choice === "approve",
      {
        id: interaction.user.id,
        name: interaction.user.username,
      },
    );
    await interaction.editReply(notice(result.message, result.ok ? "go" : "caution"));
  },
};

let lastPrune = 0;
/** Decided requests are kept STREAM_REQUESTS_DAYS; checked once an hour with the other sweeps. */
export async function maybePruneStreamRequests(ctx: BotContext) {
  if (Date.now() - lastPrune < 60 * 60_000) return;
  lastPrune = Date.now();
  await pruneStreamRequests(ctx.db, new Date(Date.now() - STREAM_REQUESTS_DAYS * 86_400_000));
}
