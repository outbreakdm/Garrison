import {
  answerMax,
  castVote,
  checkSuggestionAnswers,
  createSuggestion,
  entitlements,
  getGuildPlan,
  getSuggestion,
  getSuggestionSettings,
  getVote,
  nextVote,
  SUGGESTION_LIMITS,
  SUGGESTION_STATUS_LABEL,
  SUGGESTION_STATUSES,
  type Suggestion,
  type SuggestionsConfig,
  setSuggestionMessage,
  setSuggestionPanelMessage,
  setSuggestionStatus,
  suggestionPanel,
  suggestionQuestions,
  type VerifyAnswer,
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
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { type Card, cardMessage } from "../../lib/card.js";
import { placePanel, queuePanelMove } from "../../lib/panels.js";
import { safeText } from "../../lib/text.js";

/**
 * Suggestions: the panel's button (or /suggest) opens Discord's form; the answers become a
 * numbered card in the server's suggestions channel with For and Against buttons. A second
 * press takes a vote back; pressing the other button switches it. Staff decide from the
 * dashboard (Planned, Done, Declined, with a note) and the card updates. Done and Declined
 * close the vote. The panel can follow the cards, so it's always the channel's last message.
 */

export const SUGGESTION_PREFIX = "sg";
/** The panel's button, and the form it opens. */
export const SUGGEST_PANEL_PREFIX = "sgpanel";
export const SUGGEST_FORM_PREFIX = "sgform";
const voteId = (id: string, up: boolean) => `sg:${up ? "u" : "d"}:${id}`;
export function parseSuggestionId(customId: string) {
  const m = /^sg:([ud]):([0-9a-f-]{36})$/.exec(customId);
  return m?.[2] ? { value: m[1] === "u" ? (1 as const) : (-1 as const), id: m[2] } : null;
}

const TONE: Record<Suggestion["status"], Card["tone"]> = {
  open: "volt",
  planned: "intel",
  done: "go",
  declined: "caution",
};

/** Voting stays open until staff mark it Done or Declined. */
export const votingOpen = (s: Pick<Suggestion, "status">) =>
  s.status === "open" || s.status === "planned";

/** The card in the suggestions channel. */
export function suggestionCard(s: Suggestion): Card {
  const status = s.status as keyof typeof SUGGESTION_STATUS_LABEL;
  const total = s.up + s.down;
  const score =
    total === 0
      ? "No votes yet"
      : `${s.up} for, ${s.down} against (${Math.round((s.up / total) * 100)}% for)`;
  return {
    tone: TONE[status] ?? "volt",
    title: `Suggestion #${s.number}`,
    status: SUGGESTION_STATUS_LABEL[status] ?? "Open",
    lead: s.anonymous ? "Anonymous" : `by ${safeText(s.authorName)}`,
    blocks: [
      { text: safeText(s.text) },
      // The form's other answers, each under its question (the first one is the text above).
      ...(Array.isArray(s.answers) ? (s.answers as VerifyAnswer[]).slice(1) : []).map((a) => ({
        text: `**${safeText(a.label)}**\n${safeText(a.value)}`,
      })),
      ...(s.staffNote
        ? ["divider" as const, { text: `**Staff note:** ${safeText(s.staffNote)}` }]
        : []),
      { text: `-# ${score}` },
    ],
    actions: votingOpen(s)
      ? [
          new ButtonBuilder()
            .setCustomId(voteId(s.id, true))
            .setLabel(`For · ${s.up}`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(voteId(s.id, false))
            .setLabel(`Against · ${s.down}`)
            .setStyle(ButtonStyle.Danger),
        ]
      : [],
    module: "forum",
    at: s.createdAt,
  };
}

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

/** One suggestion a minute per member, so a channel can't be flooded. */
const lastPost = new Map<string, number>();
const POST_GAP_MS = 60_000;

/** Seconds until this member may suggest again, or 0. */
export function suggestWait(guildId: string, userId: string, now = Date.now()) {
  const wait = (lastPost.get(`${guildId}:${userId}`) ?? 0) + POST_GAP_MS - now;
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

const OFF = "Suggestions aren't on in this server. Ask staff to turn them on.";

/** The panel members see: the server's title and text, and the button that opens the form. */
export function suggestionPanelMessage(config: SuggestionsConfig) {
  const panel = suggestionPanel(config);
  return cardMessage({
    tone: "volt",
    title: panel.title,
    blocks: panel.body ? [{ text: panel.body }] : [],
    actions: [
      new ButtonBuilder()
        .setCustomId(`${SUGGEST_PANEL_PREFIX}:open`)
        .setLabel(panel.button)
        .setStyle(ButtonStyle.Primary),
    ],
    module: "forum",
  });
}

/** Discord's form: the server's questions, the first (the idea) required, the rest optional. */
export function suggestionModal(config: SuggestionsConfig) {
  return new ModalBuilder()
    .setCustomId(`${SUGGEST_FORM_PREFIX}:submit`)
    .setTitle(suggestionPanel(config).button.slice(0, 45))
    .addLabelComponents(
      ...suggestionQuestions(config).map((q, i) => {
        const input = new TextInputBuilder()
          .setCustomId(q.id)
          .setStyle(q.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setMaxLength(answerMax(q))
          .setRequired(i === 0);
        const label = new LabelBuilder().setLabel(q.label).setTextInputComponent(input);
        if (q.help) label.setDescription(q.help);
        return label;
      }),
    );
}

/** /suggest with the idea typed in: the same card as the form's, without its other answers. */
export async function doSuggest(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  rawText: string,
): Promise<Outcome & { url?: string }> {
  const text = rawText.trim();
  if (!text) return fail("Write what you'd like to suggest.");
  if (text.length > SUGGESTION_LIMITS.text)
    return fail(`Keep it under ${SUGGESTION_LIMITS.text} characters.`);
  return postSuggestion(ctx, guild, member, { text, answers: null });
}

/** The panel's form arrived: check the answers against the server's questions and post it. */
export async function submitSuggestion(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  given: Record<string, string>,
): Promise<Outcome & { url?: string }> {
  const config = await getSuggestionSettings(ctx.db, guild.id);
  const checked = checkSuggestionAnswers(suggestionQuestions(config), given);
  if (!checked.ok) return fail(checked.error);
  return postSuggestion(ctx, guild, member, checked.value, config);
}

/** Check the board is on, store the suggestion, post its card, and keep the panel last. */
async function postSuggestion(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  input: { text: string; answers: VerifyAnswer[] | null },
  loaded?: SuggestionsConfig,
): Promise<Outcome & { url?: string }> {
  const { text, answers } = input;
  const config = loaded ?? (await getSuggestionSettings(ctx.db, guild.id));
  if (!config.enabled || !config.channelId) return fail(OFF);
  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isSendable() || !channel.isTextBased())
    return fail("The suggestions channel was deleted. Ask staff to pick a new one.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(me)?.has(needed))
    return fail(
      "Garrison can't post in the suggestions channel. Ask staff to check its permissions.",
    );
  const wait = suggestWait(guild.id, member.id);
  if (wait > 0) return fail(`One suggestion a minute. Try again in ${wait}s.`);
  lastPost.set(`${guild.id}:${member.id}`, Date.now());

  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const s = await createSuggestion(ctx.db, {
    guildId: guild.id,
    authorId: member.id,
    authorName: member.displayName,
    text,
    answers,
    anonymous: config.anonymous && ent["suggestions.anonymous"],
  });
  const posted = await channel.send(cardMessage(suggestionCard(s))).catch(() => null);
  if (!posted) return fail("Garrison couldn't post in the suggestions channel.");
  await setSuggestionMessage(ctx.db, s.id, channel.id, posted.id);
  if (config.panelSticky && config.panelChannelId === channel.id)
    await keepPanelLast(ctx, guild).catch((error: unknown) =>
      ctx.logger.warn("Could not move the suggestions panel", { guildId: guild.id, error }),
    );
  return { ok: true, message: `Posted suggestion #${s.number}.`, url: posted.url };
}

/**
 * Take the panel down and post it again, so it's the last message in its channel. Read fresh
 * inside the queue: the previous move changed where it is.
 */
function keepPanelLast(ctx: BotContext, guild: Guild) {
  return queuePanelMove(`suggestions:${guild.id}`, async () => {
    const config = await getSuggestionSettings(ctx.db, guild.id);
    if (!config.enabled || !config.panelSticky || !config.panelChannelId) return;
    const channel = guild.channels.cache.get(config.panelChannelId);
    if (!channel?.isSendable() || !channel.isTextBased()) return;
    await postPanelIn(ctx, guild, config, channel);
  });
}

/** Post the panel in `channel`, take the old one down (wherever it was) and record the new. */
async function postPanelIn(
  ctx: BotContext,
  guild: Guild,
  config: SuggestionsConfig,
  channel: SendableChannels,
) {
  const at = await placePanel(guild, channel, suggestionPanelMessage(config), {
    channelId: config.panelChannelId ?? undefined,
    messageId: config.panelMessageId ?? undefined,
  });
  await setSuggestionPanelMessage(ctx.db, guild.id, at);
}

const postPanel = z.object({ channelId: z.string().regex(/^\d{17,20}$/) });

/**
 * Dashboard (or the AI assistant) request: post the suggestions panel. One panel per server:
 * posting again moves it. The same channel checks as posting any panel.
 */
export async function doPostSuggestionPanel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = postPanel.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const config = await getSuggestionSettings(ctx.db, guild.id);
  if (!config.enabled || !config.channelId)
    return fail("Turn suggestions on and pick their channel first.");
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");
  await postPanelIn(ctx, guild, config, channel);
  return { ok: true, message: `Posted the suggestions panel in #${channel.name}.` };
}

/** A For or Against press. Returns the fresh suggestion, or why the vote didn't count. */
export async function pressVote(
  ctx: BotContext,
  guildId: string,
  userId: string,
  press: { id: string; value: -1 | 1 },
): Promise<{ ok: true; suggestion: Suggestion } | { ok: false; message: string }> {
  const s = await getSuggestion(ctx.db, guildId, press.id);
  if (!s) return { ok: false, message: "That suggestion was removed." };
  if (!votingOpen(s)) return { ok: false, message: `Voting closed: staff marked it ${s.status}.` };
  const current = await getVote(ctx.db, s.id, userId);
  const fresh = await castVote(ctx.db, s.id, userId, nextVote(current, press.value));
  return fresh
    ? { ok: true, suggestion: fresh }
    : { ok: false, message: "That suggestion was removed." };
}

/** Edit the card in Discord to match the saved suggestion. */
async function refreshCard(guild: Guild, s: Suggestion) {
  if (!s.channelId || !s.messageId) return;
  const channel = guild.channels.cache.get(s.channelId);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(s.messageId).catch(() => null);
  await message?.edit(cardMessage(suggestionCard(s))).catch(() => null);
}

const statusRequest = z.object({
  id: z.string().uuid(),
  status: z.enum(SUGGESTION_STATUSES),
  note: z.string().max(SUGGESTION_LIMITS.note).nullable(),
});

/** Dashboard: staff mark a suggestion Planned, Done, Declined or Open again, with a note. */
export async function doSuggestionStatus(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = statusRequest.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const note = p.data.note?.trim() || null;
  const s = await setSuggestionStatus(
    ctx.db,
    guild.id,
    p.data.id,
    p.data.status,
    note,
    member.displayName,
  );
  if (!s) return fail("That suggestion was removed.");
  await refreshCard(guild, s);
  return {
    ok: true,
    message: `Marked suggestion #${s.number} ${SUGGESTION_STATUS_LABEL[p.data.status]}.`,
  };
}
