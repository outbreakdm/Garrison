import {
  cancelOpsEvent,
  claimDashboardActions,
  closeLfg,
  countScheduledOps,
  createOpsEvent,
  type DashboardAction,
  finishDashboardAction,
  getGatehouseSettings,
  getLfgPost,
  getOpsEvent,
  getOpsTimezone,
  getQmBuildByVersion,
  getRoleMenuPost,
  listSignups,
  recordRoleMenuPost,
  saveHealthSnapshot,
  setOpsMessage,
  signUp,
  updateGatehouseSettings,
} from "@garrison/db";
import { type Client, type Guild, type GuildMember, PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import type { BotContext } from "../../commands/types.js";
import { cardMessage } from "../../lib/card.js";
import { safeText } from "../../lib/text.js";
import { doTestAlert } from "../alerts/service.js";
import { postMessageNow } from "../dispatch/service.js";
import { restoreQuarantine } from "../gatehouse/anti-nuke.js";
import { verifyPanel } from "../gatehouse/embeds.js";
import { invalidateGatehouseSettings, lockGuild, unlockGuild } from "../gatehouse/service.js";
import { doGiveawayAction, doStartGiveaway } from "../giveaways/service.js";
import { healthFor } from "../health/command.js";
import { opsCard, shortages } from "../ops/card.js";
import { MAX_SCHEDULED } from "../ops/commands.js";
import { announcePromotion, refreshOpsCard } from "../ops/service.js";
import { parseWhen } from "../ops/when.js";
import { applyBotProfile } from "../profile/apply.js";
import { undoBuild } from "../quartermaster/service.js";
import { parseSlots } from "../rally/parse.js";
import { refreshCard } from "../rally/service.js";
import { menuRoleProblem, menuRoleProblemText, roleMenuMessage } from "../roles/menu.js";
import { loadMenu, roleFacts } from "../roles/service.js";
import { doPostTicketPanel, doTicketAction } from "../tickets/dashboard.js";
import { undoCase } from "../watch/service.js";
import {
  doCreateLfg,
  doLfgJoin,
  doLfgLeave,
  doModAction,
  doPurge,
  doQmApply,
  doQmCancel,
  doQmPlan,
  doRaidSignup,
  doRaidWithdraw,
} from "./more.js";

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
const idOnly = z.object({ id: uuid });
const lockdownStart = z.object({
  durationMinutes: z.number().int().min(1).max(1440).nullable(),
  pauseInvites: z.boolean(),
  reason: z.string().trim().max(200).nullable(),
});
const caseNumber = z.object({ caseNumber: z.number().int().min(1) });
const buildVersion = z.object({ version: z.number().int().min(1) });
const verifyPanelPayload = z.object({ channelId: snowflake });
const postRoleMenu = z.object({
  menuId: z.string().regex(/^[a-z0-9]{6,16}$/),
  channelId: snowflake,
});
const antiNuke = z.object({
  enabled: z.boolean(),
  trustedIds: z.array(snowflake).max(10),
  deleteThreshold: z.number().int().min(2).max(50),
  banThreshold: z.number().int().min(2).max(100),
});

/** Outcomes are shown as plain text on the dashboard: turn Discord mention codes into words. */
export function plainOutcome(text: string) {
  return text
    .replace(/<@&\d+>/g, "a role")
    .replace(/<#\d+>/g, "a channel")
    .replace(/<@!?\d+>/g, "that member")
    .slice(0, 300);
}

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
  const sent = await channel.send(cardMessage(opsCard(event, []))).catch(() => null);
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

async function doLockdownStart(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = lockdownStart.safeParse(raw);
  if (!p.success) return fail("That lockdown request wasn't valid.");
  const res = await lockGuild(ctx, guild, {
    source: "manual",
    reason: p.data.reason || "Locked from the dashboard",
    actorId: member.id,
    actorTag: member.user.username,
    durationMinutes: p.data.durationMinutes,
    pauseInvites: p.data.pauseInvites,
  });
  if (!res.ok) return fail(res.error);
  const lifts = p.data.durationMinutes ? ` It lifts in ${p.data.durationMinutes} min.` : "";
  return {
    ok: true,
    message: `Server locked: ${res.channels} channels${res.failed ? `, ${res.failed} couldn't be changed` : ""}.${lifts}`,
  };
}

async function doLockdownEnd(ctx: BotContext, guild: Guild, member: GuildMember) {
  const res = await unlockGuild(ctx, guild, { id: member.id, tag: member.user.username });
  if (!res.ok) return fail(res.error);
  return {
    ok: true,
    message: `Lockdown lifted: ${res.restored} channels restored${res.failed ? `, ${res.failed} couldn't be` : ""}.`,
  };
}

async function doReleaseQuarantine(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  // restoreQuarantine itself allows only the owner or a trusted user.
  const res = await restoreQuarantine(ctx, guild, p.data.id, member);
  return res.ok ? { ok: true, message: `Restored ${res.restored} roles.` } : fail(res.error);
}

async function doUndoCase(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = caseNumber.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  // undoCase also checks the requester has Ban Members / Moderate Members as the case needs.
  const res = await undoCase(ctx, guild, p.data.caseNumber, member);
  return res.ok ? { ok: true, message: `Case #${p.data.caseNumber} undone.` } : fail(res.error);
}

async function doCancelRaid(ctx: BotContext, guild: Guild, raw: unknown) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const event = await getOpsEvent(ctx.db, guild.id, p.data.id);
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled any more.");
  const cancelled = await cancelOpsEvent(ctx.db, event.id);
  if (!cancelled) return fail("That raid isn't scheduled any more.");
  await refreshOpsCard(ctx, guild, cancelled);
  return { ok: true, message: `Cancelled ${event.title}.` };
}

async function doCloseLfg(ctx: BotContext, guild: Guild, raw: unknown) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const post = await getLfgPost(ctx.db, guild.id, p.data.id);
  if (!post || (post.status !== "open" && post.status !== "full"))
    return fail("That group is already closed.");
  const closed = await closeLfg(ctx.db, post.id);
  if (!closed) return fail("That group is already closed.");
  await refreshCard(ctx, guild, closed);
  return { ok: true, message: `Closed ${post.title}.` };
}

async function doUndoBuild(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = buildVersion.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const build = await getQmBuildByVersion(ctx.db, guild.id, p.data.version);
  if (!build) return fail(`There's no build v${p.data.version}.`);
  const res = await undoBuild(ctx, guild, build, member.id);
  return res.ok
    ? {
        ok: true,
        message: `Undid v${p.data.version}: removed ${res.removed}${res.missing ? `, ${res.missing} already gone` : ""}.`,
      }
    : fail(res.error);
}

async function doRunHealth(ctx: BotContext, guild: Guild) {
  const checks = await healthFor(ctx, guild);
  await saveHealthSnapshot(ctx.db, guild.id, checks);
  const problems = checks.filter((c) => c.status !== "ok").length;
  return {
    ok: true,
    message: problems
      ? `Health check done: ${problems} to look at.`
      : "Health check done: all good.",
  };
}

async function doPostVerifyPanel(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = verifyPanelPayload.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const settings = await getGatehouseSettings(ctx.db, guild.id);
  if (!settings.verifyRoleId) return fail("Pick the verified role in Settings → Gatehouse first.");
  const role = guild.roles.cache.get(settings.verifyRoleId);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!role || role.managed)
    return fail("The verified role is gone or managed. Pick another in Settings.");
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.position >= me.roles.highest.position
  )
    return fail(
      "Garrison's role sits below the verified role. Drag Garrison above it in Server Settings → Roles.",
    );
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has([...needed, PermissionFlagsBits.EmbedLinks]))
    return fail("Garrison can't post embeds in that channel.");
  await channel.send(verifyPanel(settings));
  return { ok: true, message: `Posted the Verify button in #${channel.name}.` };
}

/**
 * Post a role menu, or update it where it was last posted. Posting it in another
 * channel moves it: the old message is deleted (it's Garrison's own). Every role
 * must be one a menu may hand out, checked again on every click.
 */
async function doPostRoleMenu(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = postRoleMenu.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const loaded = await loadMenu(ctx, guild.id, p.data.menuId);
  if (!loaded) return fail("That menu was removed. Refresh the page.");
  const { menu, ent, paused } = loaded;
  if (paused)
    return fail(
      `${menu.name} is paused: this server has more role menus than its plan runs. Remove one or upgrade on the Plan page.`,
    );
  if (!menu.options.length) return fail(`Add at least one role to ${menu.name} before posting it.`);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
    return fail("Garrison needs the Manage Roles permission to run role menus.");
  for (const id of [...menu.options.map((o) => o.roleId), menu.requiredRoleId]) {
    if (!id) continue;
    const role = guild.roles.cache.get(id);
    const problem = menuRoleProblem(
      role ? roleFacts(role) : undefined,
      guild.id,
      me.roles.highest.position,
    );
    // The needed role is only checked for, never handed out.
    if (problem && (id !== menu.requiredRoleId || problem === "missing"))
      return fail(menuRoleProblemText(problem, role ? `@${role.name}` : "a role"));
  }
  const channel = guild.channels.cache.get(p.data.channelId);
  if (!channel?.isSendable() || !channel.isTextBased()) return fail("Pick a text channel.");
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (!channel.permissionsFor(member)?.has(needed)) return fail("You can't post in that channel.");
  if (!channel.permissionsFor(me)?.has(needed)) return fail("Garrison can't post in that channel.");

  const message = roleMenuMessage(menu, ent);
  const before = await getRoleMenuPost(ctx.db, guild.id, menu.id);
  const oldChannel = before ? guild.channels.cache.get(before.channelId) : null;
  const old =
    before && oldChannel?.isTextBased()
      ? await oldChannel.messages.fetch(before.messageId).catch(() => null)
      : null;
  if (old && before?.channelId === channel.id) {
    await old.edit(message);
    return { ok: true, message: `Updated ${menu.name} in #${channel.name}.` };
  }
  const posted = await channel.send(message);
  await recordRoleMenuPost(ctx.db, {
    guildId: guild.id,
    menuId: menu.id,
    channelId: channel.id,
    messageId: posted.id,
  });
  if (old) {
    await old.delete().catch(() => null);
    return { ok: true, message: `Moved ${menu.name} to #${channel.name}.` };
  }
  return { ok: true, message: `Posted ${menu.name} in #${channel.name}.` };
}

/** Owner only, checked here against Discord: anti-nuke is the guard against rogue admins. */
async function doAntiNuke(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  if (member.id !== guild.ownerId) return fail("Only the server owner can change anti-nuke.");
  const p = antiNuke.safeParse(raw);
  if (!p.success) return fail("Those anti-nuke settings weren't valid.");
  const trusted = [...new Set(p.data.trustedIds)];
  await updateGatehouseSettings(ctx.db, guild.id, {
    antiNukeEnabled: p.data.enabled,
    antiNukeTrustedIds: trusted,
    nukeDeleteThreshold: p.data.deleteThreshold,
    nukeBanThreshold: p.data.banThreshold,
  });
  invalidateGatehouseSettings(guild.id);
  return {
    ok: true,
    message: `Anti-nuke ${p.data.enabled ? "on" : "off"} · ${trusted.length} trusted · deletes ${p.data.deleteThreshold} / bans ${p.data.banThreshold} per minute.`,
  };
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
    case "lockdown_start":
      return doLockdownStart(ctx, guild, member, action.payload);
    case "lockdown_end":
      return doLockdownEnd(ctx, guild, member);
    case "release_quarantine":
      return doReleaseQuarantine(ctx, guild, member, action.payload);
    case "undo_case":
      return doUndoCase(ctx, guild, member, action.payload);
    case "cancel_raid":
      return doCancelRaid(ctx, guild, action.payload);
    case "close_lfg":
      return doCloseLfg(ctx, guild, action.payload);
    case "undo_build":
      return doUndoBuild(ctx, guild, member, action.payload);
    case "run_health":
      return doRunHealth(ctx, guild);
    case "post_verify_panel":
      return doPostVerifyPanel(ctx, guild, member, action.payload);
    case "anti_nuke":
      return doAntiNuke(ctx, guild, member, action.payload);
    case "mod_action":
      return doModAction(ctx, guild, member, action.payload);
    case "purge":
      return doPurge(ctx, guild, member, action.payload);
    case "create_lfg":
      return doCreateLfg(ctx, guild, member, action.payload);
    case "lfg_join":
      return doLfgJoin(ctx, guild, member, action.payload);
    case "lfg_leave":
      return doLfgLeave(ctx, guild, member, action.payload);
    case "raid_signup":
      return doRaidSignup(ctx, guild, member, action.payload);
    case "raid_withdraw":
      return doRaidWithdraw(ctx, guild, member, action.payload);
    case "qm_plan":
      return doQmPlan(ctx, guild, member, action.payload);
    case "qm_apply":
      return doQmApply(ctx, guild, member, action.payload);
    case "qm_cancel":
      return doQmCancel(ctx, guild, action.payload);
    case "post_role_menu":
      return doPostRoleMenu(ctx, guild, member, action.payload);
    case "bot_profile":
      return applyBotProfile(ctx, guild, action.payload);
    case "post_message":
      return postMessageNow(ctx, guild, member, action.payload);
    case "post_ticket_panel":
      return doPostTicketPanel(ctx, guild, member, action.payload);
    case "ticket_action":
      return doTicketAction(ctx, guild, member, action.payload);
    case "start_giveaway":
      return doStartGiveaway(ctx, guild, member, action.payload);
    case "giveaway_action":
      return doGiveawayAction(ctx, guild, action.payload);
    case "test_alert":
      return doTestAlert(ctx, guild, member, action.payload);
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
    await finishDashboardAction(ctx.db, action.id, {
      ok: outcome.ok,
      message: plainOutcome(outcome.message),
    });
  }
}
