import {
  AI_SUPPLIES_PER_MESSAGE,
  AI_SUPPLIES_PER_MONTH,
  type AiAllowance,
  type AiCallUsage,
  type AiTier,
  aiAllowance,
  aiDailyBudgetMicros,
  applySettingsChange,
  cardText,
  checkQmPosts,
  checkQmSettings,
  checkQmWrites,
  costMicros,
  createQmPlan,
  type Entitlements,
  entitlements,
  finishAiCall,
  getGuildPlan,
  getQmBuild,
  type LimitReason,
  latestWaitingQmBuild,
  meterAiCall,
  QM_ATTEMPTS_PER_HOUR,
  QM_MICROS_PER_SUPPLY,
  QM_MIN_MESSAGE_SUPPLIES,
  QM_ROLE_PERMISSION_KEYS,
  QM_ROLE_PERMISSIONS,
  type QmBuild,
  type QmCreated,
  type QmEdit,
  type QmOperation,
  type QmOrder,
  type QmPost,
  type QmRolePermission,
  type QmSettingChange,
  type QmSettingProposal,
  type QmSettingsLookup,
  type QmWrite,
  qmChargedChanges,
  qmHoldSupplies,
  qmSettingAdds,
  qmWriteItemId,
  qmWritePatches,
  readSettings,
  recordQmCreated,
  reserveAiCall,
  resolveQmSettingRefs,
  retireOtherDrafts,
  SETTINGS_MODULES,
  type SettingsModule,
  settleBuildSupplies,
  transitionQmBuild,
  undoSettingsChange,
} from "@garrison/db";
import {
  ChannelType,
  type Guild,
  type GuildChannel,
  type GuildChannelEditOptions,
  GuildFeature,
  type GuildMember,
  GuildVerificationLevel,
  type OverwriteResolvable,
  OverwriteType,
  PermissionFlagsBits,
} from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { DANGEROUS_PERMISSIONS } from "../gatehouse/nuke.js";
import { invalidateLedgerSettings } from "../ledger/service.js";
import { invalidateRanksSettings } from "../ranks/service.js";
import { invalidateVoiceRooms } from "../voice/service.js";
import { carryOver } from "./carry.js";
import { asAiEdits, type ChannelKind, deletedIds } from "./edits.js";
import { keepHandChanges } from "./hand.js";
import {
  MAX_OPERATIONS,
  orderPositions,
  roleCrossing,
  rollbackOrder,
  type ServerSnapshot,
  staleReferences,
  validatePlan,
} from "./plan.js";
import {
  DEFAULT_MODEL,
  type DraftPlan,
  type Planner,
  type PlannerContinuation,
  type PlannerInput,
  type PlannerUsage,
  revisionBase,
} from "./planner.js";

/** What a model call used, priced: cached input at the cache's rates. */
export function callUsage(usage: PlannerUsage | undefined, model: string): AiCallUsage {
  if (!usage) return { model, inputTokens: 0, outputTokens: 0, costMicros: 0 };
  return {
    ...usage,
    // The planner's own total prices each request at the model that ran it.
    costMicros:
      usage.costMicros ??
      costMicros(usage.model, usage.inputTokens, usage.outputTokens, {
        read: usage.cacheReadTokens,
        write: usage.cacheWriteTokens,
      }),
  };
}

/**
 * A call that cost more than it held means a gap in the planner's fitting: say so loudly.
 * It's still charged what it cost (packs, then the pool's next period, cover it).
 */
export function warnIfOverHold(
  ctx: BotContext,
  guildId: string,
  cost: AiCallUsage,
  holdSupplies: number,
) {
  if (cost.costMicros > holdSupplies * QM_MICROS_PER_SUPPLY)
    ctx.logger.error("AI call cost more than it held", {
      guildId,
      model: cost.model,
      costMicros: cost.costMicros,
      holdSupplies,
    });
}

/**
 * The global daily budget, in millionths of a dollar, or null for none: the configured base
 * plus a share for every paying server (aiDailyBudgetMicros).
 */
export const dailyBudgetMicros = async (ctx: BotContext) =>
  ctx.qmDailyBudgetUsd === undefined ? null : aiDailyBudgetMicros(ctx.db, ctx.qmDailyBudgetUsd);

export const REQUEST_MAX = 500;

const P = PermissionFlagsBits;
/**
 * Powers that make a role staff. A new order never moves such a role or lets another role
 * pass it: staff can only moderate members whose top role is lower than theirs.
 */
const STAFF_POWERS =
  DANGEROUS_PERMISSIONS |
  P.ModerateMembers |
  P.ManageMessages |
  P.ManageNicknames |
  P.MuteMembers |
  P.DeafenMembers |
  P.MoveMembers |
  P.ManageEvents |
  P.ManageGuildExpressions;
/** What a private channel's roles may do. Nothing that moderates or manages. */
const CHANNEL_ACCESS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.Connect, P.Speak];
/** Seeing a channel without posting or speaking in it. */
const SEE = [P.ViewChannel, P.ReadMessageHistory, P.Connect];
/** What read-only takes away: posting (text) or speaking (voice). */
const QUIET_TEXT = [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads];
const QUIET_VOICE = [P.Speak, P.Stream];

/** The role permissions from QM_ROLE_PERMISSIONS that this member (Garrison) holds. */
function grantableBy(me: { permissions: { has(bit: bigint): boolean } } | null) {
  return QM_ROLE_PERMISSION_KEYS.filter((k) =>
    me ? me.permissions.has(P[QM_ROLE_PERMISSIONS[k].flag]) : false,
  );
}

/**
 * A new channel's overwrites: who sees it (private_to) and who may post or speak in it
 * (read-only, posters). Only permissions Garrison holds are set, because Discord refuses
 * an overwrite for any permission the bot doesn't have itself.
 */
export function channelOverwrites(
  op: QmOperation,
  ids: { everyone: string; me: string; resolve: (refOrId: string) => string },
  holds: (bit: bigint) => boolean,
): OverwriteResolvable[] {
  const voice = op.kind === "create_voice_channel";
  const quiet = voice ? QUIET_VOICE : QUIET_TEXT;
  const rows = new Map<string, { allow: Set<bigint>; deny: Set<bigint> }>();
  const row = (id: string) => {
    const found = rows.get(id);
    if (found) return found;
    const made = { allow: new Set<bigint>(), deny: new Set<bigint>() };
    rows.set(id, made);
    return made;
  };
  const allow = (id: string, bits: bigint[]) => {
    const r = row(id);
    for (const b of bits) {
      r.allow.add(b);
      r.deny.delete(b);
    }
  };
  const deny = (id: string, bits: bigint[]) => {
    const r = row(id);
    for (const b of bits) if (!r.allow.has(b)) r.deny.add(b);
  };
  if (op.privateTo.length) {
    deny(ids.everyone, [P.ViewChannel]);
    for (const r of op.privateTo) allow(ids.resolve(r), op.readOnly ? SEE : CHANNEL_ACCESS);
    if (op.readOnly) for (const r of op.privateTo) deny(ids.resolve(r), quiet);
  } else if (op.readOnly) {
    deny(ids.everyone, quiet);
  }
  if (op.readOnly) for (const r of op.posters ?? []) allow(ids.resolve(r), [...SEE, ...quiet]);
  if (op.privateTo.length || op.readOnly)
    allow(ids.me, [P.ViewChannel, P.Connect, P.SendMessages, P.ReadMessageHistory]);
  return [...rows].map(([id, r]) => ({
    id,
    allow: [...r.allow].filter(holds),
    deny: [...r.deny].filter(holds),
  }));
}

/** A channel's kind as the AI assistant sees it. */
function kindOf(t: ChannelType): ChannelKind {
  switch (t) {
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildVoice:
      return "voice";
    case ChannelType.GuildAnnouncement:
      return "announcement";
    case ChannelType.GuildForum:
      return "forum";
    case ChannelType.GuildStageVoice:
      return "stage";
    case ChannelType.GuildMedia:
      return "media";
    default:
      return "other";
  }
}

/** Permissions worth naming to the model, in the words Discord's settings use. */
const NAMED_PERMISSIONS: [bigint, string][] = [
  [P.Administrator, "Administrator"],
  [P.ManageGuild, "Manage Server"],
  [P.ManageRoles, "Manage Roles"],
  [P.ManageChannels, "Manage Channels"],
  [P.KickMembers, "Kick Members"],
  [P.BanMembers, "Ban Members"],
  [P.ModerateMembers, "Timeout Members"],
  [P.ManageMessages, "Manage Messages"],
  [P.ManageNicknames, "Manage Nicknames"],
  [P.ViewAuditLog, "View Audit Log"],
  [P.ManageWebhooks, "Manage Webhooks"],
  [P.ManageEvents, "Manage Events"],
  [P.ManageGuildExpressions, "Manage Expressions"],
  [P.MentionEveryone, "Mention @everyone"],
  [P.MuteMembers, "Mute Members"],
  [P.DeafenMembers, "Deafen Members"],
  [P.MoveMembers, "Move Members"],
  [P.PrioritySpeaker, "Priority Speaker"],
  [P.ChangeNickname, "Change Nickname"],
  [P.EmbedLinks, "Embed Links"],
  [P.AttachFiles, "Attach Files"],
  [P.AddReactions, "Add Reactions"],
  [P.UseExternalEmojis, "External Emoji"],
  [P.CreatePublicThreads, "Create Threads"],
  [P.Stream, "Video"],
  [P.UseApplicationCommands, "Use App Commands"],
  [P.SendVoiceMessages, "Voice Messages"],
  [P.SendPolls, "Create Polls"],
];
const namesOf = (bits: bigint) =>
  bits & P.Administrator
    ? ["Administrator"]
    : NAMED_PERMISSIONS.filter(([b]) => bits & b).map(([, n]) => n);

/**
 * Who can see a channel or category and who can post or speak in it, in words the model can
 * reason about ("hidden from everyone, visible to Members, read-only, Staff can post"), from
 * its overwrites. Only what differs from "everyone sees and posts" is listed.
 */
function accessSummary(
  ch: GuildChannel,
  everyoneId: string,
  roleName: (id: string) => string | undefined,
): Record<string, unknown> {
  const voice = ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
  const quiet = voice ? P.Speak : P.SendMessages;
  const out: Record<string, unknown> = {};
  const overwrites = [...(ch.permissionOverwrites?.cache?.values() ?? [])];
  const roles = (pick: (allow: bigint, deny: bigint) => boolean) =>
    overwrites
      .filter((o) => o.type === OverwriteType.Role && o.id !== everyoneId)
      .filter((o) => pick(o.allow.bitfield, o.deny.bitfield))
      .map((o) => roleName(o.id))
      .filter((n): n is string => Boolean(n))
      .slice(0, 8);
  const everyone = overwrites.find((o) => o.id === everyoneId);
  if (everyone && everyone.deny.bitfield & P.ViewChannel) out.hidden_from_everyone = true;
  const seeing = roles((allow) => Boolean(allow & P.ViewChannel));
  if (seeing.length) out.visible_to = seeing;
  const hiddenFrom = roles((_, deny) => Boolean(deny & P.ViewChannel));
  if (hiddenFrom.length) out.hidden_from = hiddenFrom;
  if (everyone && everyone.deny.bitfield & quiet) out.read_only = true;
  const posting = roles((allow) => Boolean(allow & quiet));
  if (posting.length) out[voice ? "can_speak" : "can_post"] = posting;
  const muted = roles((_, deny) => Boolean(deny & quiet));
  if (muted.length) out[voice ? "cannot_speak" : "cannot_post"] = muted;
  const members = overwrites.filter((o) => o.type === OverwriteType.Member).length;
  if (members) out.member_overwrites = members;
  if (ch.parentId && "permissionsLocked" in ch && ch.permissionsLocked === false)
    out.own_permissions = true;
  return out;
}

export function snapshot(guild: Guild): {
  server: ServerSnapshot;
  channels: PlannerInput["channels"];
  roleDetails: NonNullable<PlannerInput["roleDetails"]>;
  categoryDetails: NonNullable<PlannerInput["categoryDetails"]>;
  serverInfo: NonNullable<PlannerInput["serverInfo"]>;
} {
  // In Discord's own order: categories top to bottom, the channels in each (text above voice),
  // roles from the top of the list down.
  const position = (c: { rawPosition?: number; position?: number }) =>
    c.rawPosition ?? c.position ?? 0;
  const isVoice = (t: ChannelType) =>
    t === ChannelType.GuildVoice || t === ChannelType.GuildStageVoice;
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread());
  const categories = all
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => position(a) - position(b));
  const rank = new Map(categories.map((c, i) => [c.id, i]));
  const channels = all
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .sort(
      (a, b) =>
        (rank.get(a.parentId ?? "") ?? -1) - (rank.get(b.parentId ?? "") ?? -1) ||
        Number(isVoice(a.type)) - Number(isVoice(b.type)) ||
        position(a) - position(b),
    );
  const me = guild.members.me;
  const top = me?.roles.highest.position ?? 0;
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position);
  const roleName = (id: string) => guild.roles.cache.get(id)?.name;
  const membersKnown =
    guild.memberCount > 0 && (guild.members.cache?.size ?? 0) >= guild.memberCount;
  return {
    server: {
      everyoneId: guild.roles.everyone.id,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        managed: r.managed,
        // Ordering never touches staff powers, integrations, or anything Garrison can't manage.
        movable:
          r.id !== guild.roles.everyone.id &&
          !roleFixed(r, top) &&
          Boolean(me?.permissions.has(P.ManageRoles)),
      })),
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId ?? null,
        kind: kindOf(c.type),
      })),
      channelCount: all.length,
      roleCount: guild.roles.cache.size,
      grantable: grantableBy(guild.members.me),
      community: Boolean(guild.features?.includes(GuildFeature.Community)),
    },
    channels: channels.map((c) => {
      const any = c as unknown as Record<string, unknown>;
      const details: Record<string, unknown> = {
        ...accessSummary(c as GuildChannel, guild.roles.everyone.id, roleName),
      };
      if (typeof any.topic === "string" && any.topic) details.topic = any.topic.slice(0, 120);
      if (typeof any.rateLimitPerUser === "number" && any.rateLimitPerUser)
        details.slowmode_seconds = any.rateLimitPerUser;
      if (typeof any.userLimit === "number" && any.userLimit) details.user_limit = any.userLimit;
      if (any.nsfw === true) details.nsfw = true;
      if (c.id === guild.rulesChannelId) details.discord_rules_channel = true;
      if (c.id === guild.systemChannelId) details.discord_system_channel = true;
      if (c.id === guild.afkChannelId) details.afk_channel = true;
      return {
        id: c.id,
        name: c.name,
        type: kindOf(c.type),
        category: "parent" in c && c.parent ? c.parent.name : null,
        categoryId: c.parentId ?? null,
        details,
      };
    }),
    categoryDetails: Object.fromEntries(
      categories.map((c) => [
        c.id,
        accessSummary(c as GuildChannel, guild.roles.everyone.id, roleName),
      ]),
    ),
    roleDetails: Object.fromEntries(
      roles.map((r) => {
        const d: Record<string, unknown> = {};
        const perms = namesOf(r.permissions?.bitfield ?? 0n);
        if (r.id === guild.roles.everyone.id) d.permissions = perms;
        else {
          if (perms.length) d.permissions = perms;
          if (r.color) d.color = `#${r.color.toString(16).padStart(6, "0")}`;
          if (r.hoist) d.shown_separately = true;
          if (r.mentionable) d.mentionable = true;
          if (r.tags?.botId) d.bot_role = true;
          if (r.tags?.premiumSubscriberRole) d.booster_role = true;
          if (r.id === me?.roles.highest.id) d.garrisons_own_role = true;
          // Members are only counted when Discord gave Garrison every member.
          if (membersKnown && r.members) d.members = r.members.size;
        }
        return [r.id, d];
      }),
    ),
    serverInfo: {
      name: guild.name,
      members: guild.memberCount,
      community: Boolean(guild.features?.includes(GuildFeature.Community)),
      verification_level: GuildVerificationLevel[guild.verificationLevel],
      boost_tier: guild.premiumTier,
      garrisons_role: me?.roles.highest.name ?? null,
      garrison_can: {
        manage_channels: Boolean(me?.permissions.has(P.ManageChannels)),
        manage_roles: Boolean(me?.permissions.has(P.ManageRoles)),
      },
    },
  };
}

export type PlanOutcome =
  | {
      ok: true;
      build: QmBuild;
      server: ServerSnapshot;
      notes: string;
      /** Supplies left after this plan, which holds its changes until it's built, discarded or replaced. */
      suppliesLeft: number;
      /** The waiting plan this one replaced, when it was a revision. */
      replaced: QmBuild | null;
    }
  | { ok: false; error: string };

/** Builds a continuation can start from: a plan still waiting (they don't expire), or one that was built. */
export function canContinue(build: QmBuild) {
  return build.status === "pending" || build.status === "applied" || build.status === "failed";
}

/** The plan a waiting build holds, in the shape the model writes, for a revision. */
function asAiOperations(plan: QmOperation[]) {
  return plan.map((op) => ({
    kind: op.kind,
    ref: op.ref,
    name: op.name,
    parent: op.parent,
    topic: op.topic,
    slowmode_seconds: op.slowmodeSeconds,
    user_limit: op.userLimit,
    private_to: op.privateTo,
    read_only: op.readOnly ?? null,
    posters: op.posters ?? [],
    color_hex: op.color === null ? null : `#${op.color.toString(16).padStart(6, "0")}`,
    hoist: op.hoist,
    mentionable: op.mentionable,
    permissions: (op.permissions ?? []) as QmRolePermission[],
    text_kind: op.textKind ?? null,
  }));
}

/** The earlier requests in a line of continued builds, oldest first (at most four). */
async function historyOf(ctx: BotContext, guildId: string, build: QmBuild) {
  const line: QmBuild[] = [build];
  let at = build;
  while (at.continuesId && line.length < 4) {
    const parent = await getQmBuild(ctx.db, guildId, at.continuesId);
    if (!parent) break;
    line.unshift(parent);
    at = parent;
  }
  return line.map((b) => ({ version: b.version, request: b.prompt, summary: b.summary }));
}

/** What the model is told about the build being continued. Built items that were since deleted are left out. */
export async function continuationFor(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
): Promise<PlannerContinuation> {
  const history = await historyOf(ctx, guild.id, build);
  if (build.status === "pending")
    return {
      mode: "revise",
      history,
      notes: build.notes,
      operations: asAiOperations(build.plan),
      settings: (build.settings ?? []).map((c) => ({
        module: c.module,
        field: c.field,
        value_json: JSON.stringify(c.to),
      })),
      posts: (build.posts ?? []).map((x) => ({
        kind: x.kind,
        item_id: x.itemId,
        channel: x.channel,
      })),
      order: (build.orders ?? []).map((o) => ({
        scope: o.scope,
        parent: o.parent,
        items: o.items,
      })),
      edits: asAiEdits(build.edits ?? []),
      writes: (build.writes ?? []).map((w) => ({
        target:
          w.kind === "welcome"
            ? w.field === "leaveCard"
              ? "welcome_leave"
              : w.field === "dmCard"
                ? "welcome_dm"
                : "welcome_join"
            : w.kind === "role_menu"
              ? "new_role_menu"
              : w.kind === "ticket_panel"
                ? "new_ticket_panel"
                : w.kind === "giveaway"
                  ? "new_giveaway"
                  : w.isNew
                    ? "new_message"
                    : "edit_message",
        message_id: w.isNew ? (w.ref ?? "") : (w.messageId ?? ""),
        name: w.isNew ? w.name : "",
        ...cardText(w.card),
        style: w.menu?.style ?? null,
        items: w.menu
          ? w.menu.options.map((o) => ({ role: o.roleId, label: o.label, emoji: o.emoji ?? "" }))
          : (w.panel?.topics ?? []).map((t) => ({
              role: "",
              label: t.label,
              emoji: t.emoji ?? "",
            })),
        staff_roles: w.staffRoleIds ?? [],
        channel: w.giveaway?.channel ?? "",
        winners: w.giveaway?.winners ?? null,
        duration_minutes: w.giveaway?.durationMinutes ?? null,
      })),
    };
  const built = build.created.flatMap((c) =>
    c.kind === "setting" ||
    c.kind === "post" ||
    c.kind === "order" ||
    c.kind === "edit" ||
    c.kind === "deleted"
      ? []
      : (c.kind === "role" ? guild.roles.cache.has(c.id) : guild.channels.cache.has(c.id))
        ? [{ kind: c.kind, id: c.id, name: c.name }]
        : [],
  );
  return { mode: "extend", history, notes: build.notes, built };
}

/**
 * Store a checked plan as the next version: check the day's supplies again (another plan
 * or message may have used some while this one was thought up; this call's own message is
 * already counted), then replace the waiting plan it revises, if any. Shared by the
 * one-shot planner and the chat.
 */
export async function storePlan(
  ctx: BotContext,
  guildId: string,
  requester: { id: string; tag: string },
  request: string,
  checked: {
    summary: string;
    operations: QmOperation[];
    notes: string;
    settings?: QmSettingChange[];
    posts?: QmPost[];
    orders?: QmOrder[];
    edits?: QmEdit[];
    writes?: QmWrite[];
  },
  model: string,
  line: { continues: QmBuild | null; replacing: QmBuild | null },
): Promise<
  | { ok: true; build: QmBuild; suppliesLeft: number; replaced: QmBuild | null }
  | { ok: false; error: string }
> {
  // This draft replaces the person's waiting drafts here (one each per server), so what
  // those hold doesn't count against it.
  const now = await aiAllowance(ctx.db, guildId, requester.id, {
    exceptId: line.replacing?.id,
    exceptDraftsOf: { guildId, personId: requester.id },
  });
  // A redraft keeps what the admin changed by hand in the draft it replaces.
  const kept = line.replacing
    ? keepHandChanges(
        { edits: line.replacing.edits ?? [], orders: line.replacing.orders ?? [] },
        { plan: checked.operations, edits: checked.edits ?? [], orders: checked.orders ?? [] },
      )
    : { edits: checked.edits ?? [], orders: checked.orders ?? [] };
  checked = { ...checked, ...kept };
  // Hand changes cost nothing.
  const changes = qmChargedChanges({
    plan: checked.operations,
    settings: checked.settings ?? [],
    posts: checked.posts ?? [],
    orders: kept.orders,
    edits: kept.edits,
    writes: checked.writes ?? [],
  });
  if (changes > now.suppliesLeft)
    return {
      ok: false,
      error: `This plan needs ${changes} supplies, but only ${now.suppliesLeft} are left. Ask for less, or wait until they renew ${when(now.resetsAt)}.`,
    };
  const build = await createQmPlan(ctx.db, {
    guildId,
    requestedById: requester.id,
    requestedByTag: requester.tag,
    prompt: request,
    summary: checked.summary,
    plan: checked.operations,
    settings: checked.settings ?? [],
    posts: checked.posts ?? [],
    orders: checked.orders ?? [],
    edits: checked.edits ?? [],
    writes: checked.writes ?? [],
    notes: checked.notes || null,
    continuesId: line.continues?.id ?? null,
    model,
  });
  const replaced = line.replacing
    ? await transitionQmBuild(ctx.db, line.replacing.id, "pending", "cancelled", {
        error: `Replaced by v${build.version}.`,
      })
    : null;
  // A draft left in an older conversation gives its supplies back now that this one waits.
  await retireOtherDrafts(ctx.db, guildId, requester.id, build.id, build.version);
  return {
    ok: true,
    build,
    suppliesLeft: Math.max(0, now.suppliesLeft - changes),
    replaced,
  };
}

/** What a plan's settings may point at: this server's channels and roles, and what the plan makes. */
export function settingsLookup(guild: Guild, ops: QmOperation[]): QmSettingsLookup {
  const made = new Map(
    ops.map((o) => [
      o.ref,
      o.kind === "create_role"
        ? ("role" as const)
        : o.kind === "create_category"
          ? ("category" as const)
          : o.kind === "create_voice_channel"
            ? ("voice" as const)
            : ("text" as const),
    ]),
  );
  return {
    channel: (id) => {
      const c = guild.channels.cache.get(id);
      if (!c) return null;
      if (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
        return "text";
      if (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
        return "voice";
      return c.type === ChannelType.GuildCategory ? "category" : "other";
    },
    role: (id) => {
      const role = guild.roles.cache.get(id);
      if (!role) return null;
      if (role.id === guild.roles.everyone.id || role.managed)
        return { name: role.name, status: "fixed" };
      const bits = (role.permissions as { bitfield?: bigint } | undefined)?.bitfield ?? 0n;
      return {
        name: role.name,
        status: (bits & DANGEROUS_PERMISSIONS) !== 0n ? "dangerous" : "ok",
      };
    },
    created: (ref) => made.get(ref) ?? null,
  };
}

/**
 * The lookup, knowing this server's invite codes when the settings label invites (asked of
 * Discord only then). Without Manage Server Garrison can't list them, and the check says so.
 */
async function withInvites(
  guild: Guild,
  lookup: QmSettingsLookup,
  settings: { module: string }[],
): Promise<QmSettingsLookup> {
  if (!settings.some((s) => s.module === "invites")) return lookup;
  const codes = await guild.invites
    .fetch()
    .then(
      (list) => new Set([...list.keys(), ...(guild.vanityURLCode ? [guild.vanityURLCode] : [])]),
    )
    .catch(() => null);
  return codes ? { ...lookup, invite: (code) => codes.has(code) } : lookup;
}

const proposalsOf = (changes: QmSettingChange[]): QmSettingProposal[] =>
  changes.map((c) => ({ module: c.module, field: c.field, value: c.to }));

/**
 * Check a drafted plan whole: its structure (validatePlan) and the settings it changes
 * (checkQmSettings, with the dashboard's own rules). Both count toward the plan's changes.
 */
export async function checkDraft(
  ctx: BotContext,
  guild: Guild,
  draft: DraftPlan,
  server: ServerSnapshot,
  maxOperations: number,
): Promise<
  | {
      ok: true;
      summary: string;
      operations: QmOperation[];
      notes: string;
      settings: QmSettingChange[];
      posts: QmPost[];
      orders: QmOrder[];
      edits: QmEdit[];
      writes: QmWrite[];
    }
  | { ok: false; errors: string[] }
> {
  const extra = draft.settings.length + draft.posts.length + (draft.writes?.length ?? 0);
  // What can't be deleted is only worth reading when the draft deletes something.
  if (deletesAnything(draft.edits))
    server = { ...server, protectedChannels: await protectedChannelsFor(ctx, guild) };
  const structure = validatePlan(draft, server, maxOperations, extra);
  if (!structure.ok) return structure;
  if (!extra) return { ...structure, settings: [], posts: [], writes: [] };
  // A post or setting can't point at a channel or role the same plan deletes.
  const gone = deletedIds(structure.edits);
  const leaning = [
    ...draft.posts
      .filter((x) => gone.has(x.channel))
      .map(() => "A post goes to a channel the plan deletes."),
    ...draft.settings
      .filter((x) => [...gone].some((id) => JSON.stringify(x.value ?? null).includes(id)))
      .map((x) => `The ${x.module} setting "${x.field}" uses something the plan deletes.`),
  ];
  if (leaning.length) return { ok: false, errors: leaning };
  const lookup = settingsLookup(guild, structure.operations);
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const written = await checkQmWrites(
    ctx.db,
    guild.id,
    draft.writes ?? [],
    ent,
    settingsLookup(guild, structure.operations),
  );
  // A post may name a message the same plan writes, by its ref.
  const refs = written.ok
    ? written.writes.flatMap((w) => {
        const id = qmWriteItemId(w);
        const kind =
          w.kind === "role_menu"
            ? "role_menu"
            : w.kind === "ticket_panel"
              ? "ticket_panel"
              : "message";
        return w.isNew && w.ref && id
          ? [{ kind: kind as QmPost["kind"], ref: w.ref, id, name: w.name }]
          : [];
      })
    : [];
  const [settings, posts] = await Promise.all([
    checkQmSettings(
      ctx.db,
      guild.id,
      draft.settings,
      await withInvites(guild, lookup, draft.settings),
      ent,
    ),
    checkQmPosts(ctx.db, guild.id, draft.posts, lookup, refs),
  ]);
  if (!settings.ok || !posts.ok || !written.ok)
    return {
      ok: false,
      errors: [
        ...(settings.ok ? [] : settings.errors),
        ...(posts.ok ? [] : posts.errors),
        ...(written.ok ? [] : written.errors),
      ],
    };
  const total =
    structure.operations.length +
    structure.orders.length +
    structure.edits.length +
    settings.changes.length +
    posts.posts.length +
    written.writes.length;
  if (!total) return { ok: false, errors: ["Everything in that plan is already set that way."] };
  if (total > maxOperations)
    return {
      ok: false,
      errors: [`The plan has ${total} changes, but only ${maxOperations} fit in this one.`],
    };
  return { ...structure, settings: settings.changes, posts: posts.posts, writes: written.writes };
}

/**
 * Ask the model for a plan and store it as the next version. It costs what the call really
 * cost (1 supply per $0.001) plus one per change: a plan may make up to 20 changes, or
 * whatever is left, and unused supplies stay for the next plan. A person's waiting draft is
 * what every request builds on (a new version that keeps what it doesn't drop); with none
 * waiting, continuing a built plan adds onto it.
 */
export async function planBuild(
  ctx: BotContext,
  planner: Planner,
  guild: Guild,
  requester: { id: string; tag: string },
  request: string,
  opts: { continues?: QmBuild } = {},
): Promise<PlanOutcome> {
  await ensureGuild(ctx, guild);
  // One draft per person per server: a waiting one is what every request builds on.
  const continues =
    (await latestWaitingQmBuild(ctx.db, guild.id, requester.id)) ?? opts.continues ?? null;
  if (continues && !canContinue(continues))
    return {
      ok: false,
      error: `Plan v${continues.version} can't be continued any more. Start a new plan instead.`,
    };
  // A revision replaces the waiting plan, so the changes it holds count as free again.
  const replacing = continues?.status === "pending" ? continues : null;
  const model = planner.model ?? DEFAULT_MODEL;
  // The most one round can cost; near the end of a pool, a shorter answer.
  const reserved = await reserveAiCall(ctx.db, {
    guildId: guild.id,
    feature: "qm",
    requestedBy: requester.id,
    model,
    holdSupplies: qmHoldSupplies(model, 1),
    minSupplies: QM_MIN_MESSAGE_SUPPLIES,
    exceptId: replacing?.id,
    attemptsPerHour: QM_ATTEMPTS_PER_HOUR,
    dailyBudgetMicros: await dailyBudgetMicros(ctx),
  });
  if (!reserved.ok)
    return {
      ok: false,
      error: limitMessage(reserved.reason, reserved.allowance, buySuppliesUrl(ctx, guild.id)),
    };
  const maxOperations = Math.max(
    1,
    Math.min(MAX_OPERATIONS, reserved.allowance.suppliesLeft - AI_SUPPLIES_PER_MESSAGE),
  );

  // Whatever happens below, record what the call used and charge it: a plan Garrison's checks
  // refuse still cost its AI (its changes cost nothing, since nothing is built).
  let answered = false;
  let usage: PlannerUsage | undefined;
  try {
    const snap = snapshot(guild);
    const continuation = continues ? await continuationFor(ctx, guild, continues) : undefined;
    const result = await planner.plan({
      request,
      ...snap,
      maxOperations,
      continuation,
      // Each request is counted and fitted inside what this call holds.
      budgetMicros: reserved.hold * QM_MICROS_PER_SUPPLY,
    });
    usage = result.usage;
    if (!result.ok) return result;
    answered = true;
    // Charged what it cost so far, so the plan is checked against what's really left.
    if (usage) await meterAiCall(ctx.db, reserved.id, callUsage(usage, model));
    // A revision keeps the waiting draft's structure it doesn't drop (carry.ts). This planner
    // writes structure only, so the draft's settings, posts and writes stay as they were.
    const kept = {
      settings: replacing?.settings ?? [],
      posts: replacing?.posts ?? [],
      writes: replacing?.writes ?? [],
    };
    const structureOnly = { settings: [], posts: [], writes: [] };
    const plan =
      continuation?.mode === "revise"
        ? carryOver(
            { ...revisionBase(continuation), ...structureOnly },
            { ...result.plan, ...structureOnly },
          ).plan
        : result.plan;
    const server = deletesAnything(plan.edits)
      ? { ...snap.server, protectedChannels: await protectedChannelsFor(ctx, guild) }
      : snap.server;
    const checked = validatePlan(
      plan,
      server,
      maxOperations,
      kept.settings.length + kept.posts.length + kept.writes.length,
    );
    if (!checked.ok) {
      ctx.logger.info("AI assistant plan rejected", { guildId: guild.id, errors: checked.errors });
      return {
        ok: false,
        error: `I couldn't make a safe plan from that:\n${checked.errors
          .slice(0, 5)
          .map((e) => `- ${e}`)
          .join("\n")}`,
      };
    }
    const stored = await storePlan(
      ctx,
      guild.id,
      requester,
      request,
      { ...checked, ...kept },
      result.model,
      { continues, replacing },
    );
    if (!stored.ok) return stored;
    return { ...stored, server: snap.server, notes: checked.notes };
  } finally {
    const cost = callUsage(usage, model);
    warnIfOverHold(ctx, guild.id, cost, reserved.hold);
    await finishAiCall(ctx.db, reserved.id, {
      ...cost,
      ok: answered,
      charge: true,
    }).catch((error: unknown) =>
      ctx.logger.warn("Couldn't record a Quartermaster call", { guildId: guild.id, error }),
    );
  }
}

/** A time as Discord shows it to each reader ("in 3 hours"). */
const when = (at: Date) => `<t:${Math.floor(at.getTime() / 1000)}:R>`;
const upgradeLine = (tier: AiTier) =>
  tier === "free"
    ? ` Garrison Pro gives a server ${AI_SUPPLIES_PER_MONTH.pro.toLocaleString("en-US")} supplies a month of its own.`
    : "";

export type SuppliesInfo = Pick<AiAllowance, "tier" | "pool" | "perPerson" | "shared" | "resetsAt">;

/** Where a server buys supply packs: its Plan page. */
export const buySuppliesUrl = (ctx: BotContext, guildId: string) =>
  ctx.appUrl ? `${ctx.appUrl.replace(/\/$/, "")}/servers/${guildId}/plan#supplies` : undefined;

/**
 * Not enough supplies left, in plain words: when the pool renews, and where to buy a pack
 * (with a link where one shows as a link, as in Discord).
 */
export function suppliesMessage(a: SuppliesInfo, buyUrl?: string) {
  const pool = a.pool.toLocaleString("en-US");
  const renew = `They renew ${when(a.resetsAt)}.`;
  const buy = ` Need more now? Buy a supply pack on this server's Plan page${buyUrl ? `: ${buyUrl}` : "."}`;
  if (a.perPerson)
    return `You've used this month's ${pool} AI assistant supplies on Free servers. ${renew}${buy}${upgradeLine(a.tier)}`;
  if (a.shared)
    return `Your Agency servers have used this month's ${pool} AI assistant supplies. ${renew}${buy}`;
  return `This server has used this month's ${pool} AI assistant supplies. ${renew}${buy}`;
}

/** Why an AI call can't start, in plain words. */
export function limitMessage(reason: LimitReason, a: SuppliesInfo, buyUrl?: string) {
  if (reason === "supplies" || reason === "person") return suppliesMessage(a, buyUrl);
  if (reason === "hourly")
    return "That's a lot of AI assistant use in one hour. Try again in a little while.";
  return `The AI assistant has reached its limit for today across all servers. It's back ${when(
    new Date(Math.ceil(Date.now() / 86_400_000) * 86_400_000),
  )}.`;
}

export type ApplyOutcome =
  | { ok: true; build: QmBuild; created: QmCreated[]; failed: string | null }
  | { ok: false; error: string };

/**
 * Run a pending plan. It's claimed first (pending -> applied), so a double
 * click applies once. Each created object is recorded as soon as it exists,
 * so Undo can clean up even after a failure partway through. Once it has run, the
 * changes it made that the pool can't cover come out of the server's supply packs.
 */
export async function applyBuild(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
): Promise<ApplyOutcome> {
  const outcome = await runBuild(ctx, guild, build);
  if (outcome.ok)
    await settleBuildSupplies(ctx.db, build.id).catch((error: unknown) =>
      ctx.logger.warn("Couldn't settle a build's supplies", { guildId: guild.id, error }),
    );
  return outcome;
}

async function runBuild(ctx: BotContext, guild: Guild, build: QmBuild): Promise<ApplyOutcome> {
  // Drafts wait as long as they need to, so the server may have changed since this one was
  // drafted: build nothing if it points at something that's gone.
  const gone = staleReferences(build, snapshot(guild).server);
  if (gone.length)
    return {
      ok: false,
      error: `The server changed since this draft was made: ${gone.slice(0, 3).join(", ")} ${gone.length === 1 ? "is" : "are"} gone. Ask the AI assistant to update the draft, then apply it.`,
    };
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (
    (build.plan.length || build.edits?.length) &&
    !me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])
  ) {
    return {
      ok: false,
      error:
        "I'm missing Manage Channels or Manage Roles, so I can't build. Run /health for a fix link.",
    };
  }
  const settings = build.settings ?? [];
  const ent = settings.length ? entitlements(await getGuildPlan(ctx.db, guild.id)) : null;
  if (ent) {
    // Settings may have changed since the plan was drafted; check them again before building.
    const now = await checkQmSettings(
      ctx.db,
      guild.id,
      proposalsOf(settings),
      await withInvites(guild, settingsLookup(guild, build.plan), settings),
      ent,
    );
    if (!now.ok)
      return {
        ok: false,
        error: `This plan's settings can't be applied now: ${now.errors.slice(0, 2).join(" ")}`,
      };
  }
  const posts = build.posts ?? [];
  if (posts.length) {
    const now = await checkQmPosts(
      ctx.db,
      guild.id,
      posts.map((x) => ({ kind: x.kind, itemId: x.itemId, channel: x.channel })),
      settingsLookup(guild, build.plan),
    );
    if (!now.ok)
      return {
        ok: false,
        error: `This plan's posts can't be made now: ${now.errors.slice(0, 2).join(" ")}`,
      };
  }
  const claimed = await transitionQmBuild(ctx.db, build.id, "pending", "applied", {
    appliedAt: new Date(),
  });
  if (!claimed) return { ok: false, error: "That plan was already applied or discarded." };

  const ids = new Map<string, string>();
  const created: QmCreated[] = [];
  const reason = `AI assistant v${build.version} · requested by ${build.requestedByTag}`;
  const resolve = (refOrId: string) => ids.get(refOrId) ?? refOrId;

  try {
    for (const op of build.plan) {
      let item: QmCreated;
      if (op.kind === "create_role") {
        const role = await guild.roles.create({
          name: op.name,
          color: op.color ?? undefined,
          hoist: op.hoist,
          mentionable: op.mentionable,
          // Only member-level permissions from the allowlist, and only ones Garrison holds.
          permissions: (op.permissions ?? [])
            .filter((p): p is QmRolePermission => Object.hasOwn(QM_ROLE_PERMISSIONS, p))
            .map((p) => P[QM_ROLE_PERMISSIONS[p].flag])
            .filter((bit) => me.permissions.has(bit)),
          reason,
        });
        item = { kind: "role", id: role.id, name: role.name };
      } else if (op.kind === "create_category") {
        const category = await guild.channels.create({
          name: op.name,
          type: ChannelType.GuildCategory,
          reason,
        });
        item = { kind: "category", id: category.id, name: category.name };
      } else {
        const overwrites = channelOverwrites(
          op,
          { everyone: guild.roles.everyone.id, me: me.id, resolve },
          (bit) => me.permissions.has(bit),
        );
        const channel = await guild.channels.create({
          name: op.name,
          type:
            op.kind === "create_voice_channel"
              ? ChannelType.GuildVoice
              : op.textKind === "announcement"
                ? ChannelType.GuildAnnouncement
                : op.textKind === "forum"
                  ? ChannelType.GuildForum
                  : ChannelType.GuildText,
          parent: op.parent ? resolve(op.parent) : undefined,
          topic: op.topic ?? undefined,
          rateLimitPerUser: op.slowmodeSeconds ?? undefined,
          userLimit: op.userLimit ?? undefined,
          permissionOverwrites: overwrites,
          reason,
        });
        item = { kind: "channel", id: channel.id, name: channel.name };
      }
      ids.set(op.ref, item.id);
      created.push(item);
      await recordQmCreated(ctx.db, build.id, item);
    }
  } catch (error) {
    ctx.logger.warn("Quartermaster build failed partway", {
      guildId: guild.id,
      version: build.version,
      error,
    });
    const failed =
      "Discord refused one of the changes, so I stopped. Use Undo to remove what was created.";
    await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
    return { ok: true, build: claimed, created, failed };
  }
  if (build.edits?.length) {
    const failed = await applyPlanEdits(ctx, guild, build, ids, created, me, reason);
    if (failed) {
      await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
      return { ok: true, build: claimed, created, failed };
    }
  }
  if (build.orders?.length) {
    const failed = await applyPlanOrders(ctx, guild, build, ids, created);
    if (failed) {
      await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
      return { ok: true, build: claimed, created, failed };
    }
  }
  if (ent) {
    const failed = await applyPlanSettings(ctx, guild, build, ids, ent, created);
    if (failed) {
      await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
      return { ok: true, build: claimed, created, failed };
    }
  }
  if (build.writes?.length) {
    const failed = await applyPlanWrites(
      ctx,
      guild,
      build,
      ent ?? entitlements(await getGuildPlan(ctx.db, guild.id)),
      created,
      ids,
    );
    if (failed) {
      await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
      return { ok: true, build: claimed, created, failed };
    }
  }
  if (posts.length || build.writes?.some((w) => w.kind === "giveaway")) {
    const failed = await applyPlanPosts(ctx, guild, build, ids, created);
    if (failed) {
      await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
      return { ok: true, build: claimed, created, failed };
    }
  }
  // Last, so nothing the plan made or changed depends on what's gone.
  const failedDelete = await applyPlanDeletes(ctx, guild, build, created, me, reason);
  if (failedDelete) {
    await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failedDelete });
    return { ok: true, build: claimed, created, failed: failedDelete };
  }
  return { ok: true, build: claimed, created, failed: null };
}

/** An order's key in the build's record: "roles", "categories" or "channels:<category id>". */
const orderKey = (scope: QmOrder["scope"], parent: string | null) =>
  scope === "channels" ? `channels:${parent}` : scope;

/**
 * Put items in a new order, top to bottom: they swap among the places they hold now, so
 * nothing outside the list moves. Roles are checked again here (Discord's word on what
 * Garrison may move, at this moment), including that none passes a staff or bot role.
 * Returns the order the items were in before. (Discord keeps no audit reason for moves.)
 */
async function setOrder(
  guild: Guild,
  scope: QmOrder["scope"],
  parent: string | null,
  ids: string[],
): Promise<string[]> {
  if (scope === "roles") {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const top = me.roles.highest.position;
    const roles = ids.map((id) => guild.roles.cache.get(id)).filter((r) => r !== undefined);
    for (const r of roles)
      if (roleFixed(r, top)) throw new Error(`@${r.name} can't be moved by Garrison`);
    const ladder = [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, fixed: roleFixed(r, top) }));
    const crossing = roleCrossing(ladder, ids);
    if (crossing)
      throw new Error(`@${guild.roles.cache.get(crossing)?.name} would pass a staff or bot role`);
    const before = [...roles].sort((a, b) => b.position - a.position).map((r) => r.id);
    const moves = orderPositions(
      roles.map((r) => ({ id: r.id, position: r.position })),
      ids,
      true,
    );
    await guild.roles.setPositions(moves.map((m) => ({ role: m.id, position: m.position })));
    return before;
  }
  const at = (c: { rawPosition?: number }) => c.rawPosition ?? 0;
  // Every sibling, numbered top to bottom: Discord's raw positions can repeat, and two
  // items sharing one would keep their order whatever was asked.
  const siblings = [...guild.channels.cache.values()]
    .filter((c) => !c.isThread())
    .filter((c) =>
      scope === "categories"
        ? c.type === ChannelType.GuildCategory
        : c.type !== ChannelType.GuildCategory && c.parentId === parent,
    )
    .sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
  const listed = new Set(ids);
  const before = siblings.filter((c) => listed.has(c.id)).map((c) => c.id);
  const numbered = siblings.map((c, i) => ({ id: c.id, position: i }));
  const moved = new Map(orderPositions(numbered, ids, false).map((m) => [m.id, m.position]));
  await guild.channels.setPositions(
    numbered.map((c) => ({ channel: c.id, position: moved.get(c.id) ?? c.position })),
  );
  return before;
}

/**
 * A role no order may move or let another pass: it has staff powers, belongs to an app, or
 * sits at or above Garrison's own role (`top`).
 */
function roleFixed(
  r: { managed: boolean; position: number; permissions: { any(bits: bigint): boolean } },
  top: number,
) {
  return r.managed || r.position >= top || r.permissions.any(STAFF_POWERS);
}

/** What an access edit manages on a channel; every other bit in an overwrite stays as it is. */
const ACCESS_BITS = [
  P.ViewChannel,
  P.SendMessages,
  P.SendMessagesInThreads,
  P.CreatePublicThreads,
  P.ReadMessageHistory,
  P.Connect,
  P.Speak,
  P.Stream,
];
/** Every permission the AI assistant may give a role (QM_ROLE_PERMISSIONS), as one bitfield. */
const ROLE_GIVABLE = QM_ROLE_PERMISSION_KEYS.reduce(
  (bits, k) => bits | P[QM_ROLE_PERMISSIONS[k].flag],
  0n,
);

type Overwrite = { id: string; type: number; allow: string; deny: string };
interface ChannelState {
  name: string;
  topic: string | null;
  slowmode: number | null;
  userLimit: number | null;
  nsfw: boolean | null;
  parentId: string | null;
  overwrites: Overwrite[];
}
interface RoleState {
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string;
}
/** What an edit record holds (QmCreated "edit", as JSON in name): enough to put it back. */
type EditRecord =
  | { t: "channel"; before: ChannelState; synced?: { id: string; before: ChannelState }[] }
  | { t: "role"; before: RoleState };

type EditableChannel = GuildChannel & {
  edit(options: GuildChannelEditOptions): Promise<unknown>;
};

function channelState(ch: GuildChannel): ChannelState {
  const any = ch as unknown as Record<string, unknown>;
  return {
    name: ch.name,
    topic: "topic" in ch ? ((any.topic as string | null) ?? null) : null,
    slowmode: "rateLimitPerUser" in ch ? ((any.rateLimitPerUser as number | null) ?? 0) : null,
    userLimit: "userLimit" in ch ? ((any.userLimit as number | null) ?? 0) : null,
    nsfw: "nsfw" in ch ? Boolean(any.nsfw) : null,
    parentId: ch.parentId ?? null,
    overwrites: [...ch.permissionOverwrites.cache.values()].map((o) => ({
      id: o.id,
      type: o.type,
      allow: o.allow.bitfield.toString(),
      deny: o.deny.bitfield.toString(),
    })),
  };
}

/** Put a channel back as it was: name, topic, slowmode, limit, category and every overwrite. */
async function restoreChannel(ch: EditableChannel, before: ChannelState, reason: string) {
  const patch: GuildChannelEditOptions = {
    name: before.name,
    parent: before.parentId,
    lockPermissions: false,
    permissionOverwrites: before.overwrites.map((o) => ({
      id: o.id,
      type: o.type,
      allow: BigInt(o.allow),
      deny: BigInt(o.deny),
    })),
    reason,
  };
  if (before.topic !== null || "topic" in ch)
    (patch as { topic?: string | null }).topic = before.topic;
  if (before.slowmode !== null) patch.rateLimitPerUser = before.slowmode;
  if (before.userLimit !== null) (patch as { userLimit?: number }).userLimit = before.userLimit;
  if (before.nsfw !== null) patch.nsfw = before.nsfw;
  await ch.edit(patch);
}

/**
 * A channel's or category's overwrites with new access: who sees it (privateTo) and who posts
 * or speaks (readOnly, posters). Only ACCESS_BITS change, and only those Garrison holds. With
 * privateTo, other plain roles lose an explicit "can see" so it really is private to those
 * roles; staff and bot roles keep theirs, so moderators still see everything they did.
 */
function accessOverwrites(
  ch: GuildChannel,
  access: NonNullable<QmEdit["access"]>,
  ids: { everyone: string; me: string; resolve: (refOrId: string) => string },
  holds: (bit: bigint) => boolean,
  keepRole: (roleId: string) => boolean,
): OverwriteResolvable[] {
  const managed = ACCESS_BITS.filter(holds).reduce((a, b) => a | b, 0n);
  const current = new Map(
    [...ch.permissionOverwrites.cache.values()].map((o) => [
      o.id,
      { type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield },
    ]),
  );
  const privateTo = access.privateTo.map(ids.resolve);
  const posters = access.posters.map(ids.resolve);
  const touched = new Set([ids.everyone, ids.me, ...privateTo, ...posters]);
  for (const [id, o] of current)
    if (touched.has(id)) {
      o.allow &= ~managed;
      o.deny &= ~managed;
    } else if (privateTo.length && o.type === OverwriteType.Role && !keepRole(id)) {
      o.allow &= ~((P.ViewChannel | P.Connect) & managed);
    }
  const voice = ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
  const kinds: QmOperation["kind"][] =
    ch.type === ChannelType.GuildCategory
      ? ["create_text_channel", "create_voice_channel"]
      : [voice ? "create_voice_channel" : "create_text_channel"];
  for (const kind of kinds) {
    const rows = channelOverwrites(
      {
        kind,
        privateTo: access.privateTo,
        readOnly: access.readOnly,
        posters: access.posters,
      } as QmOperation,
      ids,
      holds,
    );
    for (const row of rows) {
      const id = String(row.id);
      const o = current.get(id) ?? {
        type: id === ids.everyone || current.has(id) ? OverwriteType.Role : OverwriteType.Role,
        allow: 0n,
        deny: 0n,
      };
      // A member overwrite for Garrison itself, a role overwrite for everyone else.
      if (!current.has(id) && id === ids.me) o.type = OverwriteType.Member;
      for (const bit of (row.allow ?? []) as bigint[]) {
        o.allow |= bit;
        o.deny &= ~bit;
      }
      for (const bit of (row.deny ?? []) as bigint[]) if (!(o.allow & bit)) o.deny |= bit;
      current.set(id, o);
    }
  }
  return [...current]
    .filter(([, o]) => o.allow || o.deny)
    .map(([id, o]) => ({ id, type: o.type, allow: o.allow, deny: o.deny }));
}

/**
 * Channels Discord or Garrison depends on, with why, so a plan can't delete them: Community
 * channels Discord requires, and every channel a Garrison setting points at (log channels,
 * welcome, tickets, suggestions…). Read only when a plan deletes something.
 */
export async function protectedChannelsFor(ctx: BotContext, guild: Guild) {
  const out: Record<string, string> = {};
  const discord: [string | null, string][] = [
    [guild.rulesChannelId, "Discord requires a rules channel in a Community server."],
    [guild.publicUpdatesChannelId, "Discord sends Community updates there."],
    [guild.safetyAlertsChannelId, "Discord sends safety alerts there."],
  ];
  for (const [id, why] of discord) if (id) out[id] = why;
  const modules = SETTINGS_MODULES;
  const values = await Promise.all(
    modules.map((m) => readSettings(ctx.db, guild.id, m).catch(() => null)),
  );
  values.forEach((v, i) => {
    if (!v) return;
    for (const id of JSON.stringify(v).match(/\d{17,20}/g) ?? [])
      if (guild.channels.cache.has(id) && !out[id])
        out[id] = `Garrison's ${modules[i]} settings use it. Change that setting first.`;
  });
  return out;
}

/** Does the build delete anything? Then protected channels need reading before checks. */
export const deletesAnything = (edits: { kind: string }[] | undefined) =>
  (edits ?? []).some((e) => e.kind.startsWith("delete_"));

/**
 * A build's edits to existing items, once the items it creates exist. Each item's state is
 * recorded before it changes, so Undo puts it back even after a failure partway. Everything
 * is checked again here: the plan may have waited, and Discord's word is what counts now.
 * Deletions run last, in applyPlanDeletes. Returns why it stopped, or null.
 */
async function applyPlanEdits(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  ids: Map<string, string>,
  created: QmCreated[],
  me: GuildMember,
  reason: string,
): Promise<string | null> {
  const resolve = (refOrId: string) => ids.get(refOrId) ?? refOrId;
  const holds = (bit: bigint) => me.permissions.has(bit);
  const top = me.roles.highest.position;
  const keepRole = (roleId: string) => {
    const r = guild.roles.cache.get(roleId);
    return !r || roleFixed(r, top);
  };
  for (const e of (build.edits ?? []).filter((x) => !x.kind.startsWith("delete_"))) {
    try {
      if (e.kind === "edit_role") {
        const role = guild.roles.cache.get(e.id);
        if (!role)
          return `@${e.was} isn't in the server anymore, so I stopped. Use Undo to put things back.`;
        if (roleFixed(role, top))
          return `@${role.name} has staff powers or sits above Garrison now, so I left it and stopped.`;
        const record: QmCreated = {
          kind: "edit",
          ...(e.by ? { by: e.by } : {}),
          id: role.id,
          name: JSON.stringify({
            t: "role",
            before: {
              name: role.name,
              color: role.color,
              hoist: role.hoist,
              mentionable: role.mentionable,
              permissions: role.permissions.bitfield.toString(),
            },
          } satisfies EditRecord),
        };
        created.push(record);
        await recordQmCreated(ctx.db, build.id, record);
        const chosen = (e.permissions ?? [])
          .filter((p): p is QmRolePermission => Object.hasOwn(QM_ROLE_PERMISSIONS, p))
          .map((p) => P[QM_ROLE_PERMISSIONS[p].flag])
          .filter(holds)
          .reduce((a, b) => a | b, 0n);
        await role.edit({
          ...(e.name ? { name: e.name } : {}),
          ...(e.color !== undefined ? { color: e.color } : {}),
          ...(e.hoist !== undefined ? { hoist: e.hoist } : {}),
          ...(e.mentionable !== undefined ? { mentionable: e.mentionable } : {}),
          // Only the givable bits change; anything else the role has stays.
          ...(e.permissions
            ? { permissions: (role.permissions.bitfield & ~ROLE_GIVABLE) | chosen }
            : {}),
          reason,
        });
        continue;
      }
      const ch = guild.channels.cache.get(e.id);
      if (!ch || ch.isThread() || ch.isDMBased())
        return `${e.was} isn't in the server anymore, so I stopped. Use Undo to put things back.`;
      const channel = ch as EditableChannel;
      const ids_ = { everyone: guild.roles.everyone.id, me: me.id, resolve };
      // A category's channels that follow it keep following it after its access changes.
      const followers =
        e.kind === "edit_category" && e.access
          ? ([...guild.channels.cache.values()].filter(
              (c) =>
                !c.isThread() &&
                c.parentId === ch.id &&
                "permissionsLocked" in c &&
                c.permissionsLocked === true,
            ) as unknown as EditableChannel[])
          : [];
      const record: QmCreated = {
        kind: "edit",
        ...(e.by ? { by: e.by } : {}),
        id: ch.id,
        name: JSON.stringify({
          t: "channel",
          before: channelState(channel),
          ...(followers.length
            ? { synced: followers.map((f) => ({ id: f.id, before: channelState(f) })) }
            : {}),
        } satisfies EditRecord),
      };
      created.push(record);
      await recordQmCreated(ctx.db, build.id, record);
      const patch: GuildChannelEditOptions = { reason };
      if (e.name) patch.name = e.name;
      if (e.topic !== undefined) (patch as { topic?: string | null }).topic = e.topic || null;
      if (e.slowmodeSeconds !== undefined) patch.rateLimitPerUser = e.slowmodeSeconds;
      if (e.userLimit !== undefined) (patch as { userLimit?: number }).userLimit = e.userLimit;
      if (e.nsfw !== undefined) patch.nsfw = e.nsfw;
      if (e.parent !== undefined) {
        patch.parent = e.parent ? resolve(e.parent) : null;
        patch.lockPermissions = Boolean(e.syncWithCategory);
      }
      if (e.access)
        patch.permissionOverwrites = accessOverwrites(channel, e.access, ids_, holds, keepRole);
      await channel.edit(patch);
      if (e.syncWithCategory && e.parent === undefined && "lockPermissions" in channel)
        await (channel as unknown as { lockPermissions(): Promise<unknown> }).lockPermissions();
      for (const f of followers)
        if ("lockPermissions" in f)
          await (f as unknown as { lockPermissions(): Promise<unknown> }).lockPermissions();
    } catch (error) {
      ctx.logger.warn("Quartermaster edit failed", { guildId: guild.id, id: e.id, error });
      return `Discord refused the change to ${e.was}, so I stopped. Use Undo to put things back.`;
    }
  }
  return null;
}

/**
 * A build's deletions, last of all. Checked again first (still there, still not something
 * Discord or Garrison depends on, a role still safe to touch). Deletions are permanent: each
 * is recorded as "deleted" so Undo can say what it couldn't bring back. Returns why it
 * stopped, or null.
 */
async function applyPlanDeletes(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  created: QmCreated[],
  me: GuildMember,
  reason: string,
): Promise<string | null> {
  const deletes = (build.edits ?? []).filter((x) => x.kind.startsWith("delete_"));
  if (!deletes.length) return null;
  const protectedNow = await protectedChannelsFor(ctx, guild);
  const top = me.roles.highest.position;
  for (const e of deletes) {
    try {
      if (e.kind === "delete_role") {
        const role = guild.roles.cache.get(e.id);
        if (!role) continue;
        if (roleFixed(role, top))
          return `@${role.name} has staff powers or sits above Garrison now, so I didn't delete it.`;
        await role.delete(reason);
      } else {
        const ch = guild.channels.cache.get(e.id);
        if (!ch || ch.isThread() || ch.isDMBased()) continue;
        const why = protectedNow[ch.id];
        if (why) return `I didn't delete ${ch.name}: ${why}`;
        await ch.delete(reason);
      }
      const item: QmCreated = {
        kind: "deleted",
        id: e.id,
        name: e.was,
        ...(e.by ? { by: e.by } : {}),
      };
      created.push(item);
      await recordQmCreated(ctx.db, build.id, item);
    } catch (error) {
      ctx.logger.warn("Quartermaster delete failed", { guildId: guild.id, id: e.id, error });
      return `Discord refused to delete ${e.was}, so I stopped. Use Undo for the rest.`;
    }
  }
  return null;
}

/** A build's new orders, once what they name exists. Returns why it stopped, or null. */
async function applyPlanOrders(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  ids: Map<string, string>,
  created: QmCreated[],
): Promise<string | null> {
  const resolve = (refOrId: string) => ids.get(refOrId) ?? refOrId;
  for (const order of build.orders ?? []) {
    const parent = order.parent ? resolve(order.parent) : null;
    try {
      const before = await setOrder(guild, order.scope, parent, order.items.map(resolve));
      const item: QmCreated = {
        kind: "order",
        ...(order.by ? { by: order.by } : {}),
        id: orderKey(order.scope, parent),
        name: JSON.stringify(before),
      };
      created.push(item);
      await recordQmCreated(ctx.db, build.id, item);
    } catch (error) {
      ctx.logger.warn("Quartermaster order failed", { guildId: guild.id, error });
      return `Discord wouldn't put the ${order.scope} in the new order, so I stopped. Use Undo to put things back.`;
    }
  }
  return null;
}

/**
 * A build's settings, once the channels and roles they point at exist: checked against the
 * values as they are now, then the plan's refs swapped for what the build just made.
 * Returns why it stopped, or null.
 */
async function applyPlanSettings(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  ids: Map<string, string>,
  ent: Entitlements,
  created: QmCreated[],
): Promise<string | null> {
  try {
    const checked = await checkQmSettings(
      ctx.db,
      guild.id,
      proposalsOf(build.settings ?? []),
      await withInvites(guild, settingsLookup(guild, build.plan), build.settings ?? []),
      ent,
    );
    if (!checked.ok) throw new SettingsRefused(checked.errors.slice(0, 2).join(" "));
    // A field that adds to a list saves the whole list as it is now, with the new items.
    const changes = checked.changes.map((c) => ({
      ...c,
      to: resolveQmSettingRefs(
        qmSettingAdds(c.module, c.field) ? { ...c, to: checked.full[c.module]?.[c.field] } : c,
        ids,
      ),
    }));
    const modules = [...new Set(changes.map((c) => c.module))];
    for (const module of modules) {
      const patch = Object.fromEntries(
        changes.filter((c) => c.module === module).map((c) => [c.field, c.to]),
      );
      const result = await applySettingsChange(ctx.db, {
        guildId: guild.id,
        module,
        patch,
        userId: build.requestedById,
        username: `${build.requestedByTag} (AI assistant v${build.version})`,
      });
      if (!result.ok) {
        if (result.reason === "unchanged") continue;
        throw new SettingsRefused(`${module} settings weren't ready.`);
      }
      refreshSettings(module, guild.id);
      for (const field of Object.keys(result.change.changes)) {
        const item: QmCreated = {
          kind: "setting",
          id: result.change.id,
          name: `${module}.${field}`,
        };
        created.push(item);
        await recordQmCreated(ctx.db, build.id, item);
      }
    }
    return null;
  } catch (error) {
    ctx.logger.warn("Quartermaster settings failed", {
      guildId: guild.id,
      version: build.version,
      error,
    });
    return `The settings couldn't be changed${
      error instanceof SettingsRefused ? `: ${error.message}` : ""
    }. Use Undo to remove what was created.`;
  }
}

/**
 * A build's writes: the welcome cards and saved messages it writes, checked again against the
 * server as it is now and saved through Settings history, so Undo puts the old text back.
 */
async function applyPlanWrites(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  ent: Entitlements,
  created: QmCreated[],
  ids: Map<string, string>,
): Promise<string | null> {
  const writes = build.writes ?? [];
  if (!writes.length) return null;
  const planned = await qmWritePatches(ctx.db, guild.id, writes, ent, ids);
  if (!planned.ok) return `The text couldn't be saved: ${planned.error} Use Undo for the rest.`;
  for (const { module, patch } of planned.patches) {
    const result = await applySettingsChange(ctx.db, {
      guildId: guild.id,
      module,
      patch,
      userId: build.requestedById,
      username: `${build.requestedByTag} (AI assistant v${build.version})`,
    });
    if (!result.ok) {
      if (result.reason === "unchanged") continue;
      return `The ${{ welcome: "welcome cards", messages: "messages", roles: "role menus", tickets: "ticket panels" }[module]} weren't ready to change. Use Undo for the rest.`;
    }
    refreshSettings(module, guild.id);
    const item: QmCreated = { kind: "setting", id: result.change.id, name: `${module}.write` };
    created.push(item);
    await recordQmCreated(ctx.db, build.id, item);
  }
  return null;
}

type PostHandler = (
  ctx: BotContext,
  guild: Guild,
  member: GuildMember,
  raw: unknown,
) => Promise<{ ok: boolean; message: string }>;

/**
 * A build's posts, last. Each goes through the dashboard's own post request, with the
 * admin who asked as the member, so the same checks run: the item still exists, the plan
 * allows it, its roles are safe, and both they and Garrison can post in the channel.
 */
async function applyPlanPosts(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  ids: Map<string, string>,
  created: QmCreated[],
): Promise<string | null> {
  const posts = build.posts ?? [];
  const giveaways = (build.writes ?? []).flatMap((w) =>
    w.kind === "giveaway" && w.giveaway ? [w.giveaway] : [],
  );
  // Loaded here: the dashboard's request handlers import this file.
  const [{ doPostRoleMenu }, { postMessageNow }, { doPostTicketPanel }, { doStartGiveaway }] =
    await Promise.all([
      import("../dashboard/actions.js"),
      import("../dispatch/service.js"),
      import("../tickets/dashboard.js"),
      import("../giveaways/service.js"),
    ]);
  const handlers: Record<QmPost["kind"], [PostHandler, string]> = {
    role_menu: [doPostRoleMenu, "menuId"],
    ticket_panel: [doPostTicketPanel, "panelId"],
    message: [postMessageNow, "messageId"],
  };
  const member = await guild.members.fetch(build.requestedById).catch(() => null);
  if (!member) return "The admin who asked for this plan has left, so nothing was posted.";
  let done = 0;
  for (const post of posts) {
    const channelId = ids.get(post.channel) ?? post.channel;
    const [handler, key] = handlers[post.kind];
    const result = await handler(ctx, guild, member, { [key]: post.itemId, channelId }).catch(
      (error: unknown) => {
        ctx.logger.warn("Quartermaster post failed", { guildId: guild.id, error });
        return { ok: false, message: "Discord refused it." };
      },
    );
    if (!result.ok)
      return `Posted ${done} of ${posts.length}; ${post.name} wasn't posted: ${result.message}`;
    done++;
    const item: QmCreated = { kind: "post", id: channelId, name: `${post.kind}:${post.name}` };
    created.push(item);
    await recordQmCreated(ctx.db, build.id, item);
  }
  // New giveaways start through the dashboard's own request, so its checks run too.
  for (const g of giveaways) {
    const channelId = ids.get(g.channel) ?? g.channel;
    const result = await doStartGiveaway(ctx, guild, member, {
      channelId,
      prize: g.prize,
      description: g.description,
      winners: g.winners,
      durationMinutes: g.durationMinutes,
    }).catch((error: unknown) => {
      ctx.logger.warn("Quartermaster giveaway failed", { guildId: guild.id, error });
      return { ok: false, message: "Discord refused it." };
    });
    if (!result.ok) return `The giveaway for ${g.prize} didn't start: ${result.message}`;
    const item: QmCreated = { kind: "post", id: channelId, name: `giveaway:${g.prize}` };
    created.push(item);
    await recordQmCreated(ctx.db, build.id, item);
  }
  return null;
}

class SettingsRefused extends Error {}

/** What an undo did to settings and posts, as sentences, or "" when the build had none. */
export function undoSettingsNote(
  s: { undone: number; changedSince: number },
  posts = 0,
  deleted = 0,
) {
  const parts = [
    s.undone ? `put back ${s.undone} module${s.undone === 1 ? "'s" : "s'"} settings` : null,
    s.changedSince
      ? `left ${s.changedSince} as they are, because someone changed them since`
      : null,
  ].filter(Boolean);
  const kept = posts
    ? ` ${posts === 1 ? "Its post stays" : `Its ${posts} posts stay`}; delete in Discord if needed.`
    : "";
  const gone = deleted
    ? ` ${deleted === 1 ? "The one thing it deleted" : `The ${deleted} things it deleted`} can't be brought back.`
    : "";
  return `${parts.length ? ` Settings: ${parts.join("; ")}.` : ""}${kept}${gone}`;
}

/** The bot keeps some settings for a minute; a change from a build should show straight away. */
function refreshSettings(module: SettingsModule, guildId: string) {
  if (module === "ledger") invalidateLedgerSettings(guildId);
  else if (module === "ranks") invalidateRanksSettings(guildId);
  else if (module === "voice") invalidateVoiceRooms(guildId);
}

export type UndoOutcome =
  | {
      ok: true;
      removed: number;
      missing: number;
      failed: number;
      /** Settings changes put back, and ones left because someone changed them since. */
      settings: { undone: number; changedSince: number };
      /** Posts the build made; they aren't removed. */
      posts: number;
      /** Things the build deleted; they can't be brought back. */
      deleted: number;
    }
  | { ok: false; error: string };

/** Remove exactly what a build created, and nothing else. */
export async function undoBuild(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  actorId: string,
  actorName = "AI assistant",
): Promise<UndoOutcome> {
  if (build.status !== "applied" && build.status !== "failed") {
    return {
      ok: false,
      error: `v${build.version} is ${build.status.replace("_", " ")}, so there's nothing to undo.`,
    };
  }
  const claimed = await transitionQmBuild(ctx.db, build.id, build.status, "rolled_back", {
    rolledBackAt: new Date(),
    rolledBackById: actorId,
  });
  if (!claimed) return { ok: false, error: `v${build.version} was already undone.` };

  const me = guild.members.me ?? (await guild.members.fetchMe());
  const reason = `AI assistant: undo v${build.version}`;
  let removed = 0;
  let missing = 0;
  let failed = 0;
  const settings = { undone: 0, changedSince: 0 };
  // Newest first, so a later change to the same module comes off before an earlier one.
  const changeIds = [
    ...new Set(claimed.created.filter((c) => c.kind === "setting").map((c) => c.id)),
  ].reverse();
  for (const id of changeIds) {
    try {
      const result = await undoSettingsChange(ctx.db, guild.id, id, {
        userId: actorId,
        username: `${actorName} (undo AI assistant v${build.version})`,
      });
      if (result.ok) {
        settings.undone++;
        refreshSettings(result.change.module, guild.id);
      } else if (result.reason === "conflict") settings.changedSince++;
      else if (result.reason !== "already_undone") failed++;
    } catch (error) {
      failed++;
      ctx.logger.warn("Quartermaster settings undo failed", { guildId: guild.id, id, error });
    }
  }
  // Orders first, newest first, while the things they name still exist.
  for (const item of [...claimed.created].reverse().filter((c) => c.kind === "order")) {
    try {
      const previous = JSON.parse(item.name) as string[];
      const [scope, parent] = item.id.split(":") as [QmOrder["scope"], string | undefined];
      await setOrder(guild, scope, parent ?? null, previous);
      removed++;
    } catch (error) {
      failed++;
      ctx.logger.warn("Quartermaster order undo failed", { guildId: guild.id, error });
    }
  }
  // Edits next, newest first: each item goes back to how it was before the build.
  for (const item of [...claimed.created].reverse().filter((c) => c.kind === "edit")) {
    try {
      const record = JSON.parse(item.name) as EditRecord;
      if (record.t === "role") {
        const role = guild.roles.cache.get(item.id);
        if (!role) missing++;
        else if (roleFixed(role, me.roles.highest.position)) failed++;
        else {
          const b = record.before;
          await role.edit({
            name: b.name,
            color: b.color,
            hoist: b.hoist,
            mentionable: b.mentionable,
            permissions: BigInt(b.permissions),
            reason,
          });
          removed++;
        }
      } else {
        const ch = guild.channels.cache.get(item.id);
        if (!ch || ch.isThread() || ch.isDMBased()) missing++;
        else {
          await restoreChannel(ch as EditableChannel, record.before, reason);
          for (const f of record.synced ?? []) {
            const child = guild.channels.cache.get(f.id);
            if (child && !child.isThread() && !child.isDMBased())
              await restoreChannel(child as EditableChannel, f.before, reason);
          }
          removed++;
        }
      }
    } catch (error) {
      failed++;
      ctx.logger.warn("Quartermaster edit undo failed", { guildId: guild.id, id: item.id, error });
    }
  }
  const deleted = claimed.created.filter((c) => c.kind === "deleted").length;
  for (const item of rollbackOrder(claimed.created)) {
    try {
      if (item.kind === "role") {
        const role = guild.roles.cache.get(item.id);
        if (!role) missing++;
        else if (role.managed || role.position >= me.roles.highest.position) failed++;
        else {
          await role.delete(reason);
          removed++;
        }
      } else {
        const channel = guild.channels.cache.get(item.id);
        if (!channel) missing++;
        else {
          await channel.delete(reason);
          removed++;
        }
      }
    } catch (error) {
      failed++;
      ctx.logger.warn("Quartermaster undo step failed", { guildId: guild.id, id: item.id, error });
    }
  }
  const posted = claimed.created.filter((c) => c.kind === "post").length;
  return { ok: true, removed, missing, failed, settings, posts: posted, deleted };
}
