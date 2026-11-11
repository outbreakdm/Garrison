import {
  createLfgPost,
  getLfgPost,
  getOpsEvent,
  getQmBuild,
  joinLfg,
  leaveLfg,
  listActiveMembers,
  renderWording,
  setLfgMessage,
  signUp,
  transitionQmBuild,
  withdraw,
} from "@garrison/db";
import { type Guild, type GuildMember, PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { formatDuration, MAX_TIMEOUT_SECONDS } from "../../lib/duration.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { announcePromotion, refreshOpsCard } from "../ops/service.js";
import { MAX_OPERATIONS } from "../quartermaster/plan.js";
import { applyBuild, planBuild, REQUEST_MAX } from "../quartermaster/service.js";
import { lfgCard } from "../rally/card.js";
import { notifyTemplateRole } from "../rally/commands.js";
import { LIFETIME_AFTER_START_MS, matchSlot, parseSlots, parseStart } from "../rally/parse.js";
import { announceFullSquad, refreshCard, syncVoiceAccess } from "../rally/service.js";
import { cachedTemplates, findTemplate, postWording } from "../rally/templates.js";
import { purgeMessages } from "../watch/purge.js";
import { applyMemberAction, checkMemberAction, moderatorPermission } from "../watch/service.js";

/**
 * Dashboard requests for the things that used to need a slash command or a
 * button in Discord: moderating a member, clearing messages, posting and
 * joining groups, raid signups, and Quartermaster builds. Same rules as the
 * rest: parse the payload again, and hold the requester to the permissions
 * the matching command asks for.
 */

type Outcome = { ok: boolean; message: string };
const fail = (message: string): Outcome => ({ ok: false, message });

const snowflake = z.string().regex(/^\d{17,20}$/);
const uuid = z.string().uuid();
const reason = z.string().trim().max(512).nullable();

const modAction = z.object({
  action: z.enum(["warn", "timeout", "kick", "ban"]),
  userId: snowflake,
  reason,
  durationSeconds: z.number().int().min(1).max(MAX_TIMEOUT_SECONDS).nullable(),
  deleteMessageSeconds: z.number().int().min(0).max(604_800),
});
const purge = z.object({
  channelId: snowflake,
  amount: z.number().int().min(1).max(100),
  userId: snowflake.nullable(),
  reason,
});
const createLfg = z.object({
  channelId: snowflake,
  title: z.string().trim().min(1).max(80),
  templateId: z.string().min(1).max(64).nullable(),
  roles: z.string().trim().min(1).max(120).nullable(),
  size: z.number().int().min(2).max(40).nullable(),
  myRole: z.string().trim().min(1).max(40).nullable(),
  starts: z.string().trim().min(1).max(32).nullable(),
  note: z.string().trim().max(120).nullable(),
});
const lfgJoin = z.object({ id: uuid, role: z.string().max(40) });
const idOnly = z.object({ id: uuid });
const raidSignup = z.object({
  eventId: uuid,
  role: z.string().min(1).max(40),
  spec: z.string().trim().max(20).nullable(),
});
const raidWithdraw = z.object({ eventId: uuid });
const qmPlan = z.object({ request: z.string().trim().min(1).max(REQUEST_MAX) });

const PERMISSION_NAME: Record<string, string> = {
  warn: "Moderate Members",
  timeout: "Moderate Members",
  kick: "Kick Members",
  ban: "Ban Members",
};
const DONE: Record<string, string> = {
  warn: "Warned",
  timeout: "Timed out",
  kick: "Kicked",
  ban: "Banned",
};

export async function doModAction(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
) {
  const p = modAction.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const { action, userId } = p.data;
  if (action === "timeout" && !p.data.durationSeconds) return fail("Pick how long to time out.");
  // Manage Server opens the dashboard; the action itself needs what its slash command needs.
  if (member.id !== guild.ownerId && !member.permissions.has(moderatorPermission[action]))
    return fail(`You need ${PERMISSION_NAME[action]} in Discord to do that.`);
  const target = await guild.client.users.fetch(userId).catch(() => null);
  if (!target) return fail("Discord doesn't know that user ID.");
  const targetMember = await guild.members.fetch(userId).catch(() => null);
  if (!targetMember && action !== "ban") return fail(`${target.username} isn't in this server.`);
  const problem = await checkMemberAction(guild, member, target, targetMember, action);
  if (problem) return fail(problem.replaceAll(`<@${target.id}>`, target.username));
  const result = await applyMemberAction(ctx, {
    guild,
    actor: { id: member.id, tag: member.user.username },
    target,
    member: targetMember,
    action,
    reason: p.data.reason || null,
    durationSeconds: action === "timeout" ? p.data.durationSeconds : null,
    deleteMessageSeconds: action === "ban" ? p.data.deleteMessageSeconds : undefined,
  });
  if (!result.ok) return fail(result.error);
  const length =
    action === "timeout" && p.data.durationSeconds
      ? ` for ${formatDuration(p.data.durationSeconds)}`
      : "";
  const dm = result.dmSent === false ? " Their DMs are closed, so they weren't told." : "";
  const escalated = result.escalated
    ? ` That reached the ladder: ${result.escalated.action}, case #${result.escalated.caseNumber}.`
    : "";
  return {
    ok: true,
    message: `${DONE[action]} ${target.username}${length}. Case #${result.case.caseNumber}.${escalated}${dm}`,
  };
}

export async function doPurge(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = purge.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isTextBased() || !("bulkDelete" in channel))
    return fail("Pick a text channel in this server.");
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages];
  if (!channel.permissionsFor(member)?.has(needed))
    return fail("You need Manage Messages in that channel to clear it.");
  const user = p.data.userId
    ? await guild.client.users.fetch(p.data.userId).catch(() => null)
    : null;
  if (p.data.userId && !user) return fail("Discord doesn't know that user ID.");
  const result = await purgeMessages(
    ctx,
    guild,
    channel,
    { id: member.id, tag: member.user.username },
    { amount: p.data.amount, user, reason: p.data.reason || null },
  );
  if (!result.ok) return fail(result.error);
  const skipped =
    result.deleted < p.data.amount ? " Pinned messages and ones over 14 days old are kept." : "";
  return {
    ok: true,
    message: `Deleted ${result.deleted} ${result.deleted === 1 ? "message" : "messages"} in #${channel.name}. Case #${result.case.caseNumber}.${skipped}`,
  };
}

export async function doCreateLfg(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
) {
  const p = createLfg.safeParse(raw);
  if (!p.success) return fail("That group wasn't valid.");
  await ensureGuild(ctx, guild);
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased())
    return fail("That channel isn't a text channel I can post in.");
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed))
    return fail("You can't post in that channel, so Garrison won't either.");
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me)?.has([...needed, PermissionFlagsBits.EmbedLinks]))
    return fail("Garrison can't post embeds in that channel. Check its permissions.");

  const { templates } = await cachedTemplates(ctx, guild.id);
  const template = findTemplate(templates, p.data.templateId);
  if (p.data.templateId && !template) return fail("That template is gone. Pick another.");
  if (template?.channelIds.length && !template.channelIds.includes(channel.id))
    return fail(`${template.name} groups go in other channels. Pick one of the template's.`);
  // What was typed wins; otherwise the template's defaults.
  const slots = parseSlots(
    p.data.roles ?? (p.data.size ? null : (template?.roles ?? null)),
    p.data.size ?? template?.size ?? null,
  );
  if (!slots.ok) return fail(slots.error);
  const start = parseStart(p.data.starts);
  if (!start.ok) return fail(start.error);
  const hostSlot = matchSlot(slots.value, p.data.myRole);
  if (hostSlot === null)
    return fail(`Pick your role from: ${slots.value.map((g) => g.name).join(", ")}.`);

  const post = await createLfgPost(ctx.db, {
    guildId: guild.id,
    channelId: channel.id,
    hostId: member.id,
    hostSlot,
    title: p.data.title,
    note: p.data.note || null,
    slots: slots.value,
    startsAt: start.value,
    expiresAt: new Date(
      start.value.getTime() +
        (template ? template.lifetimeHours * 3_600_000 : LIFETIME_AFTER_START_MS),
    ),
    templateId: template?.id ?? null,
    wording: template ? { ...template.wording, voice: template.voice } : null,
  });
  if (!post) return fail("You already have an open group. Close it first.");
  const sent = await channel
    .send(cardMessage(lfgCard(post, await listActiveMembers(ctx.db, post.id))))
    .catch(() => null);
  if (!sent) return fail("The group is saved, but posting its card failed.");
  await setLfgMessage(ctx.db, post.id, sent.id);
  if (template?.notifyRoleId)
    await notifyTemplateRole(ctx, guild, channel, post, template.notifyRoleId, sent.url);
  return { ok: true, message: `Posted ${p.data.title} in #${channel.name}.` };
}

export async function doLfgJoin(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = lfgJoin.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const post = await getLfgPost(ctx.db, guild.id, p.data.id);
  if (!post) return fail("That group is gone.");
  const group = post.slots.find((g) => g.name === p.data.role);
  if (!group) return fail("That role doesn't exist any more.");
  const result = await joinLfg(ctx.db, post.id, member.id, group.name);
  if (!result.ok)
    return fail(
      {
        not_found: "That group is gone.",
        closed: "This group is closed.",
        already: "You're already in this group.",
        full: renderWording("{Group}'s full.", postWording(post.wording)),
        slot_full: `${group.name || "That role"} is full. Pick another role.`,
        no_such_slot: "That role doesn't exist any more.",
      }[result.reason],
    );
  await refreshCard(ctx, guild, result.post);
  await syncVoiceAccess(guild, result.post, member.id, true);
  if (result.becameFull) await announceFullSquad(ctx, guild, result.post, result.members);
  return {
    ok: true,
    message: `You're in ${post.title}${group.name ? ` as ${group.name}` : ""}.`,
  };
}

export async function doLfgLeave(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const post = await getLfgPost(ctx.db, guild.id, p.data.id);
  if (!post) return fail("That group is gone.");
  const result = await leaveLfg(ctx.db, post.id, member.id);
  if (!result.ok)
    return fail(
      result.reason === "not_member" ? "You're not in this group." : "This group is closed.",
    );
  await refreshCard(ctx, guild, result.post);
  await syncVoiceAccess(guild, result.post, member.id, false);
  return { ok: true, message: `You left ${post.title}.` };
}

export async function doRaidSignup(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
) {
  const p = raidSignup.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const event = await getOpsEvent(ctx.db, guild.id, p.data.eventId);
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled any more.");
  const res = await signUp(ctx.db, event.id, member.id, p.data.role, p.data.spec || null, false);
  if (!res.ok)
    return fail(
      res.reason === "no_such_role"
        ? "That role isn't in this raid."
        : res.reason === "unchanged"
          ? "You're already signed up like that."
          : "That raid isn't open for signups.",
    );
  await refreshOpsCard(ctx, guild, res.event, res.signups);
  return {
    ok: true,
    message: res.benched
      ? `${p.data.role} is full, so you're on the bench for ${event.title}.`
      : `You're signed up for ${event.title} as ${p.data.role}.`,
  };
}

export async function doRaidWithdraw(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
) {
  const p = raidWithdraw.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const event = await getOpsEvent(ctx.db, guild.id, p.data.eventId);
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled any more.");
  const res = await withdraw(ctx.db, event.id, member.id);
  if (!res.ok)
    return fail(res.reason === "not_signed_up" ? "You're not signed up." : "This raid is closed.");
  await refreshOpsCard(ctx, guild, res.event, res.signups);
  if (res.promoted) await announcePromotion(guild, res.event, res.promoted);
  return { ok: true, message: `You withdrew from ${event.title}.` };
}

export async function doQmPlan(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = qmPlan.safeParse(raw);
  if (!p.success) return fail("Describe what to build, in 500 characters or fewer.");
  if (!ctx.planner)
    return fail("Quartermaster isn't set up on this Garrison: the bot has no Claude API key.");
  const outcome = await planBuild(
    ctx,
    ctx.planner,
    guild,
    { id: member.id, tag: member.user.username },
    p.data.request,
  );
  if (!outcome.ok) return fail(outcome.error.replace(/\n- /g, " · ").replace(/\n/g, " "));
  const n = outcome.build.plan.length;
  const left = outcome.notes ? ` Left out: ${outcome.notes}` : "";
  return {
    ok: true,
    message: `Plan v${outcome.build.version} is ready: ${n} of ${MAX_OPERATIONS} changes at most. Nothing is built until you apply it.${left}`,
  };
}

export async function doQmApply(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const build = await getQmBuild(ctx.db, guild.id, p.data.id);
  if (!build) return fail("That plan doesn't exist.");
  // Same rule as the button in Discord: a plan is applied by whoever asked for it.
  if (build.requestedById !== member.id)
    return fail("Only the person who asked for this plan can apply it.");
  const result = await applyBuild(ctx, guild, build);
  if (!result.ok)
    return fail(result.error.replace("ask again with /qm build", "describe it again"));
  const made = `${result.created.length} of ${build.plan.length}`;
  return result.failed
    ? fail(`v${build.version}: built ${made}, then stopped. ${result.failed}`)
    : { ok: true, message: `Built v${build.version}: ${result.created.length} created.` };
}

export async function doQmCancel(ctx: BotContext, guild: Guild, raw: unknown) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const build = await getQmBuild(ctx.db, guild.id, p.data.id);
  if (!build) return fail("That plan doesn't exist.");
  const done = await transitionQmBuild(ctx.db, build.id, "pending", "cancelled");
  return done
    ? { ok: true, message: `Discarded plan v${build.version}. Nothing was changed.` }
    : fail("That plan isn't waiting any more.");
}
