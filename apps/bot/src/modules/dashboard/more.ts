import {
  aiTier,
  createLfgPost,
  createQmPlan,
  getLfgPost,
  getOpsEvent,
  getQmBuild,
  joinLfg,
  latestWaitingQmBuild,
  leaveLfg,
  listActiveMembers,
  noteDashboardAction,
  QM_PLAN_TTL_MS,
  qmChangeCount,
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
import { chatTurn } from "../quartermaster/chat.js";
import { applyHandChange } from "../quartermaster/hand.js";
import { withoutItem } from "../quartermaster/remove.js";
import { applyBuild, planBuild, REQUEST_MAX, snapshot } from "../quartermaster/service.js";
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
  // Timeouts up to Discord's 28 days; temporary bans up to 90 days.
  durationSeconds: z
    .number()
    .int()
    .min(1)
    .max(90 * 86_400)
    .nullable(),
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
const qmChat = z.object({
  message: z.string().trim().min(1).max(REQUEST_MAX),
  threadId: uuid.optional(),
  fresh: z.boolean().optional(),
  model: z.enum(["fast", "smart"]).optional(),
  continues: uuid.optional(),
});
const qmPlan = z.object({
  request: z.string().trim().min(1).max(REQUEST_MAX),
  continues: uuid.optional(),
});

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
  if (action === "timeout" && (p.data.durationSeconds ?? 0) > MAX_TIMEOUT_SECONDS)
    return fail("Timeouts can last 28 days at most.");
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
    durationSeconds: action === "timeout" || action === "ban" ? p.data.durationSeconds : null,
    deleteMessageSeconds: action === "ban" ? p.data.deleteMessageSeconds : undefined,
  });
  if (!result.ok) return fail(result.error);
  const length =
    (action === "timeout" || action === "ban") && p.data.durationSeconds
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
  if (!group) return fail("That role doesn't exist anymore.");
  const result = await joinLfg(ctx.db, post.id, member.id, group.name);
  if (!result.ok)
    return fail(
      {
        not_found: "That group is gone.",
        closed: "This group is closed.",
        already: "You're already in this group.",
        full: renderWording("{Group}'s full.", postWording(post.wording)),
        slot_full: `${group.name || "That role"} is full. Pick another role.`,
        no_such_slot: "That role doesn't exist anymore.",
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
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled anymore.");
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
  if (event?.status !== "scheduled") return fail("That raid isn't scheduled anymore.");
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
    return fail("The AI assistant isn't set up on this Garrison: the bot has no Claude API key.");
  const continues = p.data.continues ? await getQmBuild(ctx.db, guild.id, p.data.continues) : null;
  if (p.data.continues && !continues) return fail("That plan doesn't exist any more.");
  const outcome = await planBuild(
    ctx,
    ctx.planner,
    guild,
    { id: member.id, tag: member.user.username },
    p.data.request,
    { continues: continues ?? undefined },
  );
  if (!outcome.ok) return fail(outcome.error.replace(/\n- /g, " · ").replace(/\n/g, " "));
  const n = qmChangeCount(outcome.build);
  const what = outcome.replaced
    ? `replaces v${outcome.replaced.version}`
    : continues
      ? `adds onto v${continues.version}`
      : "is ready";
  return {
    ok: true,
    message: `Plan v${outcome.build.version} ${what}: ${n} ${n === 1 ? "change" : "changes"}, ${outcome.suppliesLeft} supplies left. Nothing is built until you apply it.`,
  };
}

/** A message to the AI assistant's chat: it answers, asks, or drafts the next plan. */
export async function doQmChat(
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
  /** The request, so the page can show what the assistant is doing while it runs. */
  actionId?: string,
) {
  const p = qmChat.safeParse(raw);
  if (!p.success) return fail("Write a message of 500 characters or fewer.");
  if (!ctx.planner?.chat)
    return fail("The AI assistant isn't set up on this Garrison: the bot has no Claude API key.");
  let planner = ctx.planner;
  if (p.data.model === "smart") {
    if (!ctx.smartPlanner?.chat) return fail("Smart isn't set up on this Garrison. Use Fast.");
    if ((await aiTier(ctx.db, guild.id)) === "free")
      return fail("Smart is part of Garrison Pro. Fast works on every plan.");
    planner = ctx.smartPlanner;
  }
  const continues = p.data.continues ? await getQmBuild(ctx.db, guild.id, p.data.continues) : null;
  const { model: _, ...rest } = p.data;
  const outcome = await chatTurn(
    ctx,
    planner,
    guild,
    { id: member.id, tag: member.user.username },
    {
      ...rest,
      continues,
      onStep: actionId
        ? (step) =>
            void noteDashboardAction(ctx.db, actionId, `${step}…`).catch(() => {
              // Progress is a courtesy; the reply doesn't wait on it.
            })
        : undefined,
    },
  );
  if (!outcome.ok) return fail(outcome.error.replace(/\n/g, " "));
  return {
    ok: true,
    message: outcome.build
      ? "Garrison updated the draft. Open Show changes to see it."
      : "Garrison replied.",
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
  const made = `${result.created.length} of ${qmChangeCount(build)}`;
  return result.failed
    ? fail(`Applied ${made} changes, then stopped. ${result.failed}`)
    : {
        ok: true,
        message: `Applied: ${result.created.length} ${result.created.length === 1 ? "change" : "changes"} made.`,
      };
}

const removeOne = z.object({
  id: uuid,
  ref: z.string().min(1).max(40).optional(),
  setting: z.string().min(3).max(60).optional(),
  post: z.number().int().min(0).max(20).optional(),
  order: z.number().int().min(0).max(20).optional(),
  write: z.number().int().min(0).max(10).optional(),
  edit: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
});

/**
 * Take one item out of a waiting draft. The rest is stored as the next version and the old
 * one retired, the same way a revision replaces a draft; nothing is asked of the AI. Only
 * the person who asked for the draft can change it.
 */
export async function doQmRemove(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = removeOne.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const build = await getQmBuild(ctx.db, guild.id, p.data.id);
  if (build?.status !== "pending" || Date.now() - build.createdAt.getTime() > QM_PLAN_TTL_MS)
    return fail("That draft isn't waiting anymore.");
  if (build.requestedById !== member.id)
    return fail("Only the person who asked for this draft can change it.");
  const { ref, setting, post, order, edit, write } = p.data;
  const t = withoutItem(build, { ref, setting, post, order, edit, write });
  if (!t.removed.length) return fail("That isn't in the draft anymore.");
  const what =
    t.removed.length > 1
      ? `${t.removed[0]} and ${t.removed.length - 1} more that depended on it`
      : (t.removed[0] as string);
  if (
    !t.plan.length &&
    !t.settings.length &&
    !t.posts.length &&
    !t.orders.length &&
    !t.edits.length &&
    !t.writes.length
  ) {
    await transitionQmBuild(ctx.db, build.id, "pending", "cancelled");
    return { ok: true, message: `Removed ${what}. Nothing was left, so the draft is discarded.` };
  }
  const next = await createQmPlan(ctx.db, {
    guildId: guild.id,
    requestedById: build.requestedById,
    requestedByTag: build.requestedByTag,
    prompt: build.prompt,
    summary: build.summary,
    plan: t.plan,
    settings: t.settings,
    posts: t.posts,
    orders: t.orders,
    edits: t.edits,
    writes: t.writes,
    notes: build.notes,
    continuesId: build.id,
    model: build.model,
  });
  const replaced = await transitionQmBuild(ctx.db, build.id, "pending", "cancelled", {
    error: `Replaced by v${next.version}.`,
  });
  if (!replaced) {
    // Applied or discarded in the meantime: the new copy must not linger.
    await transitionQmBuild(ctx.db, next.id, "pending", "cancelled");
    return fail("That draft changed while removing. Try again.");
  }
  return { ok: true, message: `Removed ${what} from the draft.` };
}

const snowflakeOrRef = z.string().min(1).max(40);
const handChange = z.intersection(
  z.object({ id: uuid.optional() }),
  z.discriminatedUnion("change", [
    z.object({
      change: z.literal("rename"),
      target: snowflakeOrRef,
      name: z.string().min(1).max(100),
    }),
    z.object({
      change: z.literal("move"),
      target: snowflakeOrRef,
      parent: snowflakeOrRef.nullable(),
    }),
    z.object({
      change: z.literal("order"),
      scope: z.enum(["categories", "channels", "roles"]),
      parent: snowflakeOrRef.nullable(),
      items: z.array(snowflakeOrRef).min(2).max(260),
    }),
  ]),
);

/**
 * A hand change from the Your server panel (rename, move, order) into the person's waiting
 * draft, or a new draft when they have none. No AI runs and it costs no supplies. Stored as
 * the next version, like taking an item out; the old version is retired.
 */
export async function doQmEdit(ctx: BotContext, guild: Guild, member: GuildMember, raw: unknown) {
  const p = handChange.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  await ensureGuild(ctx, guild);
  // Without an id, the person's newest waiting draft when this runs: quick edits queue one
  // after another, each onto the version the one before it left.
  const build = p.data.id
    ? await getQmBuild(ctx.db, guild.id, p.data.id)
    : await latestWaitingQmBuild(ctx.db, guild.id, member.id);
  if (p.data.id) {
    if (build?.status !== "pending" || Date.now() - build.createdAt.getTime() > QM_PLAN_TTL_MS)
      return fail("That draft isn't waiting anymore. Make the change again.");
    if (build.requestedById !== member.id)
      return fail("Only the person who asked for this draft can change it.");
  }
  const t = applyHandChange(
    { plan: build?.plan ?? [], edits: build?.edits ?? [], orders: build?.orders ?? [] },
    p.data,
    snapshot(guild).server,
  );
  if (!t.ok) return fail(t.error);
  const settings = build?.settings ?? [];
  const posts = build?.posts ?? [];
  const writes = build?.writes ?? [];
  if (
    !t.plan.length &&
    !t.edits.length &&
    !t.orders.length &&
    !settings.length &&
    !posts.length &&
    !writes.length
  ) {
    if (build) await transitionQmBuild(ctx.db, build.id, "pending", "cancelled");
    return { ok: true, message: `${t.message} Nothing is left to change, so the draft is gone.` };
  }
  const next = await createQmPlan(ctx.db, {
    guildId: guild.id,
    requestedById: member.id,
    requestedByTag: build?.requestedByTag ?? member.user.username,
    prompt: build?.prompt ?? "Changes made in Your server",
    summary: build?.summary ?? "Your changes",
    plan: t.plan,
    settings,
    posts,
    orders: t.orders,
    edits: t.edits,
    writes,
    notes: build?.notes ?? null,
    continuesId: build?.id ?? null,
    model: build?.model ?? "hand",
  });
  if (build) {
    const replaced = await transitionQmBuild(ctx.db, build.id, "pending", "cancelled", {
      error: `Replaced by v${next.version}.`,
    });
    if (!replaced) {
      // Applied or discarded in the meantime: the new copy must not linger.
      await transitionQmBuild(ctx.db, next.id, "pending", "cancelled");
      return fail("That draft changed while saving. Make the change again.");
    }
  }
  return { ok: true, message: t.message };
}

export async function doQmCancel(ctx: BotContext, guild: Guild, raw: unknown) {
  const p = idOnly.safeParse(raw);
  if (!p.success) return fail("That request wasn't valid.");
  const build = await getQmBuild(ctx.db, guild.id, p.data.id);
  if (!build) return fail("That plan doesn't exist.");
  const done = await transitionQmBuild(ctx.db, build.id, "pending", "cancelled");
  return done
    ? { ok: true, message: `Discarded plan v${build.version}. Nothing was changed.` }
    : fail("That plan isn't waiting anymore.");
}
