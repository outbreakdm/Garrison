import {
  castVote,
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
  setSuggestionMessage,
  setSuggestionStatus,
} from "@garrison/db";
import {
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { type Card, cardMessage } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";

/**
 * Suggestions: /suggest posts a numbered card in the server's suggestions channel with
 * For and Against buttons. A second press takes a vote back; pressing the other button
 * switches it. Staff decide from the dashboard (Planned, Done, Declined, with a note) and
 * the card updates. Done and Declined close the vote.
 */

export const SUGGESTION_PREFIX = "sg";
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

/** /suggest: check the board is on, store the suggestion and post its card. */
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
  const config = await getSuggestionSettings(ctx.db, guild.id);
  if (!config.enabled || !config.channelId)
    return fail("Suggestions aren't on in this server. Ask staff to turn them on.");
  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isSendable() || !channel.isTextBased())
    return fail("The suggestions channel was deleted. Ask staff to pick a new one.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(me)?.has(needed))
    return fail(
      "Garrison can't post in the suggestions channel. Ask staff to check its permissions.",
    );
  const key = `${guild.id}:${member.id}`;
  const now = Date.now();
  const wait = (lastPost.get(key) ?? 0) + POST_GAP_MS - now;
  if (wait > 0) return fail(`One suggestion a minute. Try again in ${Math.ceil(wait / 1000)}s.`);
  lastPost.set(key, now);

  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const s = await createSuggestion(ctx.db, {
    guildId: guild.id,
    authorId: member.id,
    authorName: member.displayName,
    text,
    anonymous: config.anonymous && ent["suggestions.anonymous"],
  });
  const posted = await channel.send(cardMessage(suggestionCard(s))).catch(() => null);
  if (!posted) return fail("Garrison couldn't post in the suggestions channel.");
  await setSuggestionMessage(ctx.db, s.id, channel.id, posted.id);
  return { ok: true, message: `Posted suggestion #${s.number}.`, url: posted.url };
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
