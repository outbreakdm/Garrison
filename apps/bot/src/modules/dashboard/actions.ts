import {
  claimDashboardActions,
  countScheduledOps,
  createOpsEvent,
  type DashboardAction,
  finishDashboardAction,
  getOpsEvent,
  getOpsTimezone,
  listSignups,
  setOpsMessage,
  signUp,
} from "@garrison/db";
import { type Client, type Guild, type GuildMember, PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { safeText } from "../../lib/text.js";
import { opsCard, shortages } from "../ops/card.js";
import { MAX_SCHEDULED } from "../ops/commands.js";
import { announcePromotion, refreshOpsCard } from "../ops/service.js";
import { parseWhen } from "../ops/when.js";
import { parseSlots } from "../rally/parse.js";

/**
 * Works through requests the dashboard queued. Nothing from the row is
 * trusted: the payload is parsed again here, the requester must still have
 * Manage Server, and every Discord object must belong to the request's server.
 * Outcomes are short messages written here, never raw errors.
 */

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

const snowflake = z.string().regex(/^\d{17,20}$/);
const uuid = z.string().uuid();
const createRaid = z.object({
  channelId: snowflake,
  title: z.string().trim().min(1).max(80),
  when: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
  roles: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).nullable(),
  repeatWeekly: z.boolean(),
});
const moveSignup = z.object({ eventId: uuid, userId: snowflake, role: z.string().min(1).max(40) });
const callSignups = z.object({ eventId: uuid });

async function requester(guild: Guild, userId: string): Promise<GuildMember | null> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  const allowed =
    guild.ownerId === member.id || member.permissions.has(PermissionFlagsBits.ManageGuild);
  return allowed ? member : null;
}

async function doCreateRaid(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = createRaid.safeParse(raw);
  if (!p.success) return fail("That raid request wasn't valid.");
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased())
    return fail("That channel isn't a text channel I can post in.");
  // The requester must be able to post there themselves, and so must Garrison.
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed))
    return fail("You can't post in that channel, so Garrison won't either.");
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me)?.has([...needed, PermissionFlagsBits.EmbedLinks]))
    return fail("Garrison can't post embeds in that channel. Check its permissions.");
  const tz = await getOpsTimezone(ctx.db, guild.id);
  const when = parseWhen(p.data.when, tz);
  if (!when.ok) return fail(when.error);
  const slots = parseSlots(p.data.roles, null);
  if (!slots.ok) return fail(slots.error);
  if ((await countScheduledOps(ctx.db, guild.id)) >= MAX_SCHEDULED)
    return fail(`This server has ${MAX_SCHEDULED} raids scheduled. Cancel one first.`);
  const event = await createOpsEvent(ctx.db, {
    guildId: guild.id,
    channelId: channel.id,
    hostId: member.id,
    title: p.data.title,
    note: p.data.note || null,
    slots: slots.value,
    startsAt: when.value,
    timezone: tz,
    repeatWeekly: p.data.repeatWeekly,
  });
  if (!event) return fail("Garrison couldn't schedule that. Try again.");
  const sent = await channel.send(opsCard(event, [])).catch(() => null);
  if (!sent) return fail("The raid is saved, but posting the card failed.");
  await setOpsMessage(ctx.db, event.id, sent.id);
  return { ok: true, message: `Posted ${p.data.title} in #${channel.name}.` };
}

async function doMoveSignup(ctx: BotContext, guild: Guild, raw: unknown) {
  const p = moveSignup.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const event = await getOpsEvent(ctx.db, guild.id, p.data.eventId);
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled any more.");
  const current = (await listSignups(ctx.db, event.id)).find((s) => s.userId === p.data.userId);
  if (!current?.bench) return fail("That player isn't on the bench any more.");
  const res = await signUp(ctx.db, event.id, p.data.userId, p.data.role, current.spec, false);
  if (!res.ok)
    return fail(
      res.reason === "no_such_role" ? "That role isn't in this raid." : "Nothing changed.",
    );
  if (res.benched) return fail(`${p.data.role} is full. They stay on the bench.`);
  await refreshOpsCard(ctx, guild, res.event, res.signups);
  const moved = res.signups.find((s) => s.userId === p.data.userId);
  if (moved) await announcePromotion(guild, res.event, moved);
  return { ok: true, message: `Moved them to ${p.data.role} for ${event.title}.` };
}

async function doCallSignups(ctx: BotContext, guild: Guild, raw: unknown) {
  const p = callSignups.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const event = await getOpsEvent(ctx.db, guild.id, p.data.eventId);
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled any more.");
  const short = shortages(event, await listSignups(ctx.db, event.id));
  if (!short) return fail("Every role is filled already.");
  const channel = guild.channels.cache.get(event.channelId);
  if (!channel?.isSendable()) return fail("Garrison can't post in the raid's channel.");
  const link = event.messageId
    ? ` Sign up: https://discord.com/channels/${guild.id}/${event.channelId}/${event.messageId}`
    : "";
  const sent = await channel
    .send({
      content: `**${safeText(event.title)}** <t:${Math.floor(event.startsAt.getTime() / 1000)}:R> still needs players: ${short}.${link}`,
      // Never pings: a call for signups is a message, not a mention.
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  return sent ? { ok: true, message: `Posted a call for ${short}.` } : fail("Posting failed.");
}

export async function runDashboardAction(
  ctx: BotContext,
  client: Client<true>,
  action: DashboardAction,
): Promise<Outcome> {
  const guild = client.guilds.cache.get(action.guildId);
  if (!guild) return fail("Garrison isn't in that server any more.");
  const member = await requester(guild, action.requestedById);
  if (!member) return fail("You no longer have Manage Server in this server.");
  switch (action.kind) {
    case "create_raid":
      return doCreateRaid(ctx, guild, member, action.payload);
    case "move_signup":
      return doMoveSignup(ctx, guild, action.payload);
    case "call_signups":
      return doCallSignups(ctx, guild, action.payload);
    default:
      return fail("Garrison doesn't know that request.");
  }
}

export async function processDashboardActions(ctx: BotContext, client: Client<true>) {
  for (const action of await claimDashboardActions(ctx.db, 10)) {
    let outcome: Outcome;
    try {
      outcome = await runDashboardAction(ctx, client, action);
    } catch (error) {
      ctx.logger.error("Dashboard action failed", {
        actionId: action.id,
        kind: action.kind,
        error,
      });
      outcome = fail("Something went wrong. Try again.");
    }
    await finishDashboardAction(ctx.db, action.id, outcome);
  }
}
