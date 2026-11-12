import { randomInt } from "node:crypto";
import {
  blankCard,
  checkGiveaway,
  countRunningGiveaways,
  createGiveaway,
  drawWinners,
  enterGiveaway,
  entitlements,
  entryWeight,
  finishGiveaway,
  type Giveaway,
  getGiveaway,
  getGuildPlan,
  getMemberRank,
  giveawayEntryCounts,
  leaveGiveaway,
  listDueGiveaways,
  listGiveawayEntries,
  listRunningGiveaways,
  setGiveawayMessage,
  setGiveawayWinners,
  setShownEntries,
} from "@garrison/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type Guild,
  type GuildMember,
  type MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { type Card, customCardMessage, ts } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";

/**
 * Spoils (giveaways): the dashboard asks for a giveaway, the bot posts it with an
 * Enter button, and the minute sweep draws winners when time's up. A draw is
 * claimed by a conditional update, so it happens once.
 */

export const GIVEAWAY_PREFIX = "gw";
const enterId = (id: string) => `gw:e:${id}`;
const leaveId = (id: string) => `gw:l:${id}`;
export function parseGiveawayId(customId: string) {
  const m = /^gw:([el]):([0-9a-f-]{36})$/.exec(customId);
  return m?.[2] ? { kind: m[1] === "e" ? ("enter" as const) : ("leave" as const), id: m[2] } : null;
}

/** [0, 1) from the system's secure random source, for draws. */
const secureRandom = () => randomInt(0, 2 ** 47) / 2 ** 47;

const mentions = (ids: string[]) => ids.map((id) => `<@${id}>`).join(", ");

/** The card in Discord: the prize, the rules, when it ends and how many are in. */
export function giveawayMessage(
  g: Giveaway,
  entries: number,
  plan: ReturnType<typeof entitlements>,
) {
  const running = g.status === "running";
  const facts = [
    running ? `**Ends** ${ts(g.endsAt)} (${ts(g.endsAt, "f")})` : null,
    `**Winners** ${g.status === "ended" ? (g.winnerIds.length ? mentions(g.winnerIds) : "nobody entered") : g.winners}`,
    `**Entries** ${entries}`,
    `**Hosted by** <@${g.hostId}>`,
    g.requiredRoleId ? `**Open to** <@&${g.requiredRoleId}>` : null,
    g.minLevel ? `**Needs** level ${g.minLevel} in Ranks` : null,
    g.bonusRoles.length
      ? `**Bonus entries** ${g.bonusRoles.map((b) => `<@&${b.roleId}> +${b.extra}`).join(", ")}`
      : null,
    g.status === "cancelled" ? "**Cancelled.** No winners were drawn." : null,
  ].filter((l): l is string => l !== null);
  const card = {
    ...blankCard(safeText(g.prize)),
    accent: g.accent,
    blocks: [
      ...(g.description ? [{ kind: "text" as const, text: g.description }] : []),
      { kind: "text" as const, text: facts.join("\n") },
    ],
  };
  const rows = running
    ? [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(enterId(g.id))
            .setLabel("Enter")
            .setStyle(ButtonStyle.Primary),
        ),
      ]
    : [];
  return customCardMessage(card, plan, rows);
}

const note = (title: string, text: string, tone: Card["tone"] = "caution"): Card => ({
  tone,
  title,
  blocks: [{ text }],
  module: "spoils",
});

async function refreshCard(ctx: BotContext, guild: Guild, g: Giveaway, entries?: number) {
  if (!g.messageId) return;
  const channel = guild.channels.cache.get(g.channelId);
  if (!channel?.isTextBased()) return;
  const n = entries ?? (await giveawayEntryCounts(ctx.db, [g.id])).get(g.id) ?? 0;
  const plan = entitlements(await getGuildPlan(ctx.db, guild.id));
  const message = await channel.messages.fetch(g.messageId).catch(() => null);
  await message?.edit(giveawayMessage(g, n, plan));
  await setShownEntries(ctx.db, g.id, n);
}

/** Tell the channel who won, as a reply to the card. Winners are the only pings. */
async function announce(guild: Guild, g: Giveaway, winners: string[], reroll = false) {
  const channel = guild.channels.cache.get(g.channelId);
  if (!channel?.isSendable()) return;
  const prize = safeText(g.prize);
  await channel
    .send({
      content: winners.length
        ? `${reroll ? "New draw: congratulations" : "Congratulations"} ${mentions(winners)}! You won **${prize}**.`
        : `Nobody entered the giveaway for **${prize}**, so there's no winner.`,
      allowedMentions: { users: winners },
      ...(g.messageId ? { reply: { messageReference: g.messageId, failIfNotExists: false } } : {}),
    })
    .catch(() => null);
}

/** Draw and close a running giveaway (time's up, or "end now"). False if it was already closed. */
export async function drawGiveaway(ctx: BotContext, guild: Guild, g: Giveaway) {
  const entries = await listGiveawayEntries(ctx.db, g.id);
  const winners = drawWinners(entries, g.winners, secureRandom);
  const done = await finishGiveaway(ctx.db, g.id, { status: "ended", winnerIds: winners });
  if (!done) return false;
  await refreshCard(ctx, guild, done, entries.length);
  await announce(guild, done, winners);
  return true;
}

/** A member pressed Enter (or Leave). Every rule is checked as saved now. */
export async function pressGiveaway(
  ctx: BotContext,
  member: GuildMember,
  press: { kind: "enter" | "leave"; id: string },
): Promise<{ card: Card; leave?: ButtonBuilder }> {
  const g = await getGiveaway(ctx.db, member.guild.id, press.id);
  if (!g || g.status !== "running" || g.endsAt.getTime() <= Date.now())
    return { card: note("This giveaway is over", "Keep an eye out for the next one.") };
  if (press.kind === "leave") {
    await leaveGiveaway(ctx.db, g.id, member.id);
    return {
      card: note(
        "You've left",
        `You're no longer in the draw for **${safeText(g.prize)}**.`,
        "volt",
      ),
    };
  }
  if (g.requiredRoleId && !member.roles.cache.has(g.requiredRoleId))
    return {
      card: note("Not open to you", `This giveaway is for members with <@&${g.requiredRoleId}>.`),
    };
  if (g.minLevel) {
    const rank = await getMemberRank(ctx.db, member.guild.id, member.id);
    if ((rank?.level ?? 0) < g.minLevel)
      return {
        card: note(
          "Not yet",
          `This giveaway needs level ${g.minLevel} in Ranks. You're level ${rank?.level ?? 0}.`,
        ),
      };
  }
  const weight = entryWeight(g.bonusRoles, member.roles.cache.keys());
  const fresh = await enterGiveaway(ctx.db, g.id, member.id, weight);
  const leave = new ButtonBuilder()
    .setCustomId(leaveId(g.id))
    .setLabel("Leave the giveaway")
    .setStyle(ButtonStyle.Secondary);
  const many = weight > 1 ? ` with ${weight} entries` : "";
  return {
    card: fresh
      ? {
          tone: "go",
          title: "You're in",
          blocks: [{ text: `Good luck${many}! Winners are drawn ${ts(g.endsAt)}.` }],
          module: "spoils",
        }
      : {
          tone: "volt",
          title: "You're already in",
          blocks: [{ text: `You entered${many}. Winners are drawn ${ts(g.endsAt)}.` }],
          module: "spoils",
        },
    leave,
  };
}

/** The minute sweep: draw what's due, and update entry counts on running cards. */
export async function sweepGiveaways(ctx: BotContext, client: Client<true>, now = new Date()) {
  for (const g of await listDueGiveaways(ctx.db, now)) {
    const guild = client.guilds.cache.get(g.guildId);
    if (guild)
      await drawGiveaway(ctx, guild, g).catch((error: unknown) =>
        ctx.logger.error("Giveaway draw failed", { guildId: g.guildId, error }),
      );
  }
  const running = await listRunningGiveaways(ctx.db);
  const counts = await giveawayEntryCounts(
    ctx.db,
    running.map((g) => g.id),
  );
  for (const g of running) {
    const n = counts.get(g.id) ?? 0;
    const guild = client.guilds.cache.get(g.guildId);
    if (guild && n !== g.shownEntries)
      await refreshCard(ctx, guild, g, n).catch((error: unknown) =>
        ctx.logger.warn("Giveaway card update failed", { guildId: g.guildId, error }),
      );
  }
}

// --- Dashboard requests ------------------------------------------------------------

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

export async function doStartGiveaway(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const checked = checkGiveaway((raw ?? {}) as Record<string, unknown>, ent);
  if (!checked.ok) return fail(checked.error);
  const d = checked.value;
  if ((await countRunningGiveaways(ctx.db, guild.id)) >= ent["giveaways.running"])
    return fail(
      `This server already runs ${ent["giveaways.running"]} giveaways at once. End one first${ent["giveaways.rules"] ? "" : ", or upgrade"}.`,
    );
  const channel = guild.channels.cache.get(d.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");
  for (const id of [d.requiredRoleId, ...d.bonusRoles.map((b) => b.roleId)])
    if (id && !guild.roles.cache.has(id)) return fail("A role in this giveaway was deleted.");
  const g = await createGiveaway(ctx.db, {
    guildId: guild.id,
    channelId: d.channelId,
    prize: d.prize,
    description: d.description,
    winners: d.winners,
    endsAt: new Date(Date.now() + d.durationMinutes * 60_000),
    hostId: member.id,
    hostName: member.displayName,
    requiredRoleId: d.requiredRoleId,
    minLevel: d.minLevel,
    bonusRoles: d.bonusRoles,
    accent: d.accent,
  });
  const posted = await channel.send(giveawayMessage(g, 0, ent));
  await setGiveawayMessage(ctx.db, g.id, posted.id);
  return { ok: true, message: `Started the giveaway for ${d.prize} in #${channel.name}.` };
}

const action = z.object({
  giveawayId: z.string().uuid(),
  op: z.enum(["end", "reroll", "cancel"]),
});

export async function doGiveawayAction(
  ctx: BotContext,
  guild: Guild,
  raw: unknown,
): Promise<Outcome> {
  const p = action.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const g = await getGiveaway(ctx.db, guild.id, p.data.giveawayId);
  if (!g) return fail("That giveaway was removed.");
  if (p.data.op === "end") {
    if (g.status !== "running") return fail("That giveaway is already over.");
    return (await drawGiveaway(ctx, guild, g))
      ? { ok: true, message: `Drew the winners for ${g.prize}.` }
      : fail("That giveaway is already over.");
  }
  if (p.data.op === "cancel") {
    const done = await finishGiveaway(ctx.db, g.id, { status: "cancelled", winnerIds: [] });
    if (!done) return fail("That giveaway is already over.");
    await refreshCard(ctx, guild, done);
    return { ok: true, message: `Cancelled the giveaway for ${g.prize}.` };
  }
  if (g.status !== "ended") return fail("Only a finished giveaway can be drawn again.");
  const entries = await listGiveawayEntries(ctx.db, g.id);
  const winners = drawWinners(entries, g.winners, secureRandom, g.winnerIds);
  if (!winners.length) return fail("Everyone who entered has already won. Nobody's left to draw.");
  await setGiveawayWinners(ctx.db, g.id, winners);
  const updated = { ...g, winnerIds: winners };
  await refreshCard(ctx, guild, updated, entries.length);
  await announce(guild, updated, winners, true);
  return { ok: true, message: `Drew new winners for ${g.prize}.` };
}
