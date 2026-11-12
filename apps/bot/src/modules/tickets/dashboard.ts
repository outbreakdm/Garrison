import {
  entitlements,
  getGuildPlan,
  getTicket,
  getTicketConfig,
  getTicketPanelPost,
  isPanelPaused,
  recordTicketPanelPost,
  TICKET_LIMITS,
} from "@garrison/db";
import { ChannelType, type Guild, type GuildMember, PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { panelMessage } from "./panel.js";
import { claim, closeAndArchive } from "./service.js";

/**
 * Ticket requests from the dashboard: post a panel, or claim or close a ticket as
 * the member who asked. Everything is checked again here against Discord.
 */

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

const postPanel = z.object({
  panelId: z.string().regex(/^[a-z0-9]{6,16}$/),
  channelId: z.string().regex(/^\d{17,20}$/),
});
const action = z.object({
  ticketId: z.string().uuid(),
  op: z.enum(["claim", "close"]),
  reason: z.string().trim().max(TICKET_LIMITS.reason).nullable(),
});

export async function doPostTicketPanel(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = postPanel.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const [config, plan] = await Promise.all([
    getTicketConfig(ctx.db, guild.id),
    getGuildPlan(ctx.db, guild.id),
  ]);
  const ent = entitlements(plan);
  const index = config.panels.findIndex((x) => x.id === p.data.panelId);
  const panel = config.panels[index];
  if (!panel) return fail("That panel was removed. Refresh the page.");
  if (isPanelPaused(index, ent))
    return fail(`${panel.name} is paused: this server has more panels than its plan runs.`);
  if (!panel.topics.length) return fail(`Add a topic to ${panel.name} before posting it.`);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
    return fail("Garrison needs the Manage Channels permission to open tickets.");
  if (
    config.parentId &&
    guild.channels.cache.get(config.parentId)?.type !== ChannelType.GuildCategory
  )
    return fail(
      "The category tickets open in was deleted. Pick another under Who handles tickets.",
    );
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");

  const message = panelMessage(panel, ent);
  const before = await getTicketPanelPost(ctx.db, guild.id, panel.id);
  const oldChannel = before ? guild.channels.cache.get(before.channelId) : null;
  const old =
    before && oldChannel?.isTextBased()
      ? await oldChannel.messages.fetch(before.messageId).catch(() => null)
      : null;
  if (old && before?.channelId === channel.id) {
    await old.edit(message);
    return { ok: true, message: `Updated ${panel.name} in #${channel.name}.` };
  }
  const posted = await channel.send(message);
  await recordTicketPanelPost(ctx.db, {
    guildId: guild.id,
    panelId: panel.id,
    channelId: channel.id,
    messageId: posted.id,
  });
  if (old) {
    await old.delete().catch(() => null);
    return { ok: true, message: `Moved ${panel.name} to #${channel.name}.` };
  }
  return { ok: true, message: `Posted ${panel.name} in #${channel.name}.` };
}

export async function doTicketAction(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
): Promise<Outcome> {
  const p = action.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const ticket = await getTicket(ctx.db, guild.id, p.data.ticketId);
  if (!ticket) return fail("That ticket was removed.");
  if (ticket.status !== "open") return fail(`Ticket #${ticket.number} is already closed.`);
  if (p.data.op === "claim") {
    const result = await claim(ctx, member, ticket.id);
    const channel = guild.channels.cache.get(ticket.channelId);
    if (result.public && channel?.isSendable())
      await channel.send(cardMessage(result.card)).catch(() => null);
    return result.public
      ? { ok: true, message: `You claimed ticket #${ticket.number}.` }
      : fail(result.card.blocks?.map((b) => (b === "divider" ? "" : b.text)).join(" ") ?? "");
  }
  await closeAndArchive(
    ctx,
    guild,
    ticket,
    { id: member.id, name: member.displayName },
    p.data.reason || null,
  );
  return { ok: true, message: `Closed ticket #${ticket.number}.` };
}
