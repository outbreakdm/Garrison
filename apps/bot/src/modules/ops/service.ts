import {
  claimDueReminders,
  finishPastEvents,
  listRosterMembers,
  listSignups,
  type OpsEvent,
  type OpsSignup,
  type ReminderKind,
  setOpsMessage,
} from "@garrison/db";
import type { Client, Guild } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { type Card, cardEdit, cardMessage } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { sweepAttendance } from "./attendance.js";
import { opsCard, shortages } from "./card.js";

/** Team members who haven't answered an organized raid (Social members aren't expected). */
export async function teamWaiting(ctx: BotContext, event: OpsEvent, signups: OpsSignup[]) {
  if (event.style !== "organized" || !event.teamId) return [];
  const members = await listRosterMembers(ctx.db, event.guildId, [event.teamId]);
  const answered = new Set(signups.map((s) => s.userId));
  return members
    .filter((m) => m.status !== "social" && !answered.has(m.userId))
    .map((m) => m.userId);
}

/** The raid card, with its team's "No reply yet" list for an organized raid. */
export async function raidCard(
  ctx: BotContext,
  event: OpsEvent,
  signups?: OpsSignup[],
): Promise<Card> {
  const list = signups ?? (await listSignups(ctx.db, event.id));
  return opsCard(event, list, await teamWaiting(ctx, event, list));
}

export async function refreshOpsCard(
  ctx: BotContext,
  guild: Guild,
  event: OpsEvent,
  signups?: OpsSignup[],
) {
  if (!event.messageId) return;
  try {
    const channel = guild.channels.cache.get(event.channelId);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(event.messageId);
    // Raids posted before the switch to V2 stay embeds until they end.
    await message.edit(cardEdit(message, await raidCard(ctx, event, signups)));
  } catch (error) {
    ctx.logger.debug("Could not refresh an Ops card", { eventId: event.id, error });
  }
}

/** Ping exactly these users, and nobody else. */
async function sendTo(guild: Guild, channelId: string, content: string, userIds: string[]) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isSendable()) return;
  await channel
    .send({ content, allowedMentions: { users: userIds, roles: [], parse: [] } })
    .catch(() => {});
}

export async function announcePromotion(guild: Guild, event: OpsEvent, promoted: OpsSignup) {
  await sendTo(
    guild,
    event.channelId,
    `<@${promoted.userId}> moved from the bench to ${safeText(promoted.role)} for ${safeText(event.title)}.`,
    [promoted.userId],
  );
}

const LEAD: Record<ReminderKind, string> = { "24h": "tomorrow", "30m": "in 30 min" };

async function sendReminders(ctx: BotContext, client: Client<true>, kind: ReminderKind) {
  for (const event of await claimDueReminders(ctx.db, kind)) {
    const guild = client.guilds.cache.get(event.guildId);
    if (!guild) continue;
    const signups = await listSignups(ctx.db, event.id);
    const seated = signups.filter((s) => !s.bench).map((s) => s.userId);
    if (!seated.length) continue;
    const short = shortages(event, signups);
    const when = `<t:${Math.floor(event.startsAt.getTime() / 1000)}:R>`;
    const lines = [
      `${safeText(event.title)} starts ${when} (${LEAD[kind]}).${short ? ` ${short}.` : ""}`,
    ];
    lines.push(seated.map((id) => `<@${id}>`).join(" "));
    await sendTo(guild, event.channelId, lines.join("\n"), seated);
  }
}

/** Reminders, finished events, and next week's card for repeating raids. */
export async function sweepOps(ctx: BotContext, client: Client<true>) {
  await sendReminders(ctx, client, "24h");
  await sendReminders(ctx, client, "30m");
  await sweepAttendance(ctx, client).catch((error: unknown) =>
    ctx.logger.warn("Attendance sweep failed", { error }),
  );

  const { done, next } = await finishPastEvents(ctx.db);
  for (const event of done) {
    const guild = client.guilds.cache.get(event.guildId);
    if (guild) await refreshOpsCard(ctx, guild, event);
  }
  for (const event of next) {
    const guild = client.guilds.cache.get(event.guildId);
    const channel = guild?.channels.cache.get(event.channelId);
    if (!channel?.isSendable()) continue;
    try {
      const message = await channel.send(cardMessage(await raidCard(ctx, event, [])));
      await setOpsMessage(ctx.db, event.id, message.id);
    } catch (error) {
      ctx.logger.warn("Could not post next week's raid", { eventId: event.id, error });
    }
  }
}
