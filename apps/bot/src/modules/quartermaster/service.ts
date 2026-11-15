import {
  AI_SUPPLIES_PER_DAY,
  AI_SUPPLIES_PER_MESSAGE,
  type AiAllowance,
  type AiTier,
  aiAllowance,
  applySettingsChange,
  checkQmSettings,
  costMicros,
  createQmPlan,
  entitlements,
  finishAiCall,
  getGuildPlan,
  getQmBuild,
  nextUtcDayStart,
  QM_ATTEMPTS_PER_HOUR,
  QM_PLAN_TTL_MS,
  QM_ROLE_PERMISSION_KEYS,
  QM_ROLE_PERMISSIONS,
  type QmBuild,
  type QmCreated,
  type QmOperation,
  type QmRolePermission,
  type QmSettingChange,
  type QmSettingProposal,
  type QmSettingsLookup,
  qmReserveMicros,
  recordQmCreated,
  reserveAiCall,
  resolveQmSettingRefs,
  type SettingsModule,
  transitionQmBuild,
  undoSettingsChange,
} from "@garrison/db";
import { ChannelType, type Guild, type OverwriteResolvable, PermissionFlagsBits } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { DANGEROUS_PERMISSIONS } from "../gatehouse/nuke.js";
import { invalidateLedgerSettings } from "../ledger/service.js";
import { invalidateRanksSettings } from "../ranks/service.js";
import { invalidateVoiceRooms } from "../voice/service.js";
import { MAX_OPERATIONS, rollbackOrder, type ServerSnapshot, validatePlan } from "./plan.js";
import {
  DEFAULT_MODEL,
  type DraftPlan,
  type Planner,
  type PlannerContinuation,
  type PlannerInput,
} from "./planner.js";

export const PLAN_TTL_MS = QM_PLAN_TTL_MS;
export const REQUEST_MAX = 500;

const P = PermissionFlagsBits;
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

export function snapshot(guild: Guild): {
  server: ServerSnapshot;
  channels: PlannerInput["channels"];
} {
  const channels = [...guild.channels.cache.values()];
  return {
    server: {
      everyoneId: guild.roles.everyone.id,
      categories: channels
        .filter((c) => c.type === ChannelType.GuildCategory)
        .map((c) => ({ id: c.id, name: c.name })),
      roles: guild.roles.cache.map((r) => ({ id: r.id, name: r.name, managed: r.managed })),
      channelCount: channels.length,
      roleCount: guild.roles.cache.size,
      grantable: grantableBy(guild.members.me),
    },
    channels: channels
      .filter((c) => c.type !== ChannelType.GuildCategory)
      .map((c) => ({
        name: c.name,
        type:
          c.type === ChannelType.GuildText
            ? ("text" as const)
            : c.type === ChannelType.GuildVoice
              ? ("voice" as const)
              : ("other" as const),
        category: "parent" in c && c.parent ? c.parent.name : null,
      })),
  };
}

export type PlanOutcome =
  | {
      ok: true;
      build: QmBuild;
      server: ServerSnapshot;
      notes: string;
      /** Supplies left today after this plan, which holds its changes until it's built or expires. */
      suppliesLeft: number;
      /** The waiting plan this one replaced, when it was a revision. */
      replaced: QmBuild | null;
    }
  | { ok: false; error: string };

/** Builds a continuation can start from: a plan still waiting, or one that was built. */
export function canContinue(build: QmBuild, now = Date.now()) {
  if (build.status === "pending") return now - build.createdAt.getTime() < PLAN_TTL_MS;
  return build.status === "applied" || build.status === "failed";
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
    };
  const built = build.created.flatMap((c) =>
    c.kind === "setting"
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
  },
  model: string,
  line: { continues: QmBuild | null; replacing: QmBuild | null },
): Promise<
  | { ok: true; build: QmBuild; suppliesLeft: number; replaced: QmBuild | null }
  | { ok: false; error: string }
> {
  const now = await aiAllowance(ctx.db, guildId, requester.id, {
    exceptId: line.replacing?.id,
  });
  const changes = checked.operations.length + (checked.settings?.length ?? 0);
  if (changes > now.suppliesLeft)
    return {
      ok: false,
      error: `This plan needs ${changes} supplies, but only ${now.suppliesLeft} are left today. Ask for less, or wait for tomorrow's.`,
    };
  const build = await createQmPlan(ctx.db, {
    guildId,
    requestedById: requester.id,
    requestedByTag: requester.tag,
    prompt: request,
    summary: checked.summary,
    plan: checked.operations,
    settings: checked.settings ?? [],
    notes: checked.notes || null,
    continuesId: line.continues?.id ?? null,
    model,
  });
  const replaced = line.replacing
    ? await transitionQmBuild(ctx.db, line.replacing.id, "pending", "cancelled", {
        error: `Replaced by v${build.version}.`,
      })
    : null;
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
    }
  | { ok: false; errors: string[] }
> {
  const structure = validatePlan(draft, server, maxOperations, draft.settings.length);
  if (!structure.ok) return structure;
  if (!draft.settings.length) return { ...structure, settings: [] };
  const ent = entitlements(await getGuildPlan(ctx.db, guild.id));
  const settings = await checkQmSettings(
    ctx.db,
    guild.id,
    draft.settings,
    settingsLookup(guild, structure.operations),
    ent,
  );
  if (!settings.ok) return settings;
  const total = structure.operations.length + settings.changes.length;
  if (!total) return { ok: false, errors: ["Everything in that plan is already set that way."] };
  if (total > maxOperations)
    return {
      ok: false,
      errors: [`The plan has ${total} changes, but only ${maxOperations} fit in this one.`],
    };
  return { ...structure, settings: settings.changes };
}

/**
 * Ask the model for a plan and store it as the next version. It costs a message's supplies
 * plus one per change: a plan may make up to 20 changes, or whatever is left, and unused
 * supplies stay for the next plan. Continuing a waiting plan replaces it; continuing a
 * built one adds onto it.
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
  const continues = opts.continues ?? null;
  if (continues && !canContinue(continues))
    return {
      ok: false,
      error: `Plan v${continues.version} can't be continued any more. Start a new plan instead.`,
    };
  // A revision replaces the waiting plan, so the changes it holds count as free again.
  const replacing = continues?.status === "pending" ? continues : null;
  const allowance = await aiAllowance(ctx.db, guild.id, requester.id, {
    exceptId: replacing?.id,
  });
  // The message, and room for at least one change.
  const room = allowance.suppliesLeft - AI_SUPPLIES_PER_MESSAGE;
  if (room < 1) return { ok: false, error: suppliesMessage(allowance) };
  const maxOperations = Math.min(MAX_OPERATIONS, room);

  const model = planner.model ?? DEFAULT_MODEL;
  const reserved = await reserveAiCall(ctx.db, {
    guildId: guild.id,
    feature: "qm",
    requestedBy: requester.id,
    model,
    dailySupplies: allowance.suppliesPerDay,
    personDailySupplies: allowance.perPerson ? allowance.suppliesPerDay : null,
    exceptId: replacing?.id,
    attemptsPerHour: QM_ATTEMPTS_PER_HOUR,
    dailyBudgetMicros:
      ctx.qmDailyBudgetUsd === undefined ? null : Math.round(ctx.qmDailyBudgetUsd * 1e6),
    reserveMicros: qmReserveMicros(model),
  });
  if (!reserved.ok) return { ok: false, error: limitMessage(reserved.reason, allowance) };

  // Whatever happens below, record what the call used. Only a stored plan keeps the supplies.
  let keptCredit = false;
  let usage: { model: string; inputTokens: number; outputTokens: number } | undefined;
  try {
    const snap = snapshot(guild);
    const continuation = continues ? await continuationFor(ctx, guild, continues) : undefined;
    const result = await planner.plan({ request, ...snap, maxOperations, continuation });
    usage = result.usage;
    if (!result.ok) return result;
    const checked = validatePlan(result.plan, snap.server, maxOperations);
    if (!checked.ok) {
      ctx.logger.info("AI builder plan rejected", { guildId: guild.id, errors: checked.errors });
      return {
        ok: false,
        error: `I couldn't make a safe plan from that:\n${checked.errors
          .slice(0, 5)
          .map((e) => `- ${e}`)
          .join("\n")}`,
      };
    }
    const stored = await storePlan(ctx, guild.id, requester, request, checked, result.model, {
      continues,
      replacing,
    });
    if (!stored.ok) return stored;
    keptCredit = true;
    return { ...stored, server: snap.server, notes: checked.notes };
  } finally {
    await finishAiCall(ctx.db, reserved.id, {
      model: usage?.model ?? model,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costMicros: usage ? costMicros(usage.model, usage.inputTokens, usage.outputTokens) : 0,
      ok: keptCredit,
    }).catch((error: unknown) =>
      ctx.logger.warn("Couldn't record a Quartermaster call", { guildId: guild.id, error }),
    );
  }
}

const resetAt = () => `<t:${Math.floor(nextUtcDayStart().getTime() / 1000)}:R>`;
const upgradeLine = (tier: AiTier) =>
  tier === "free"
    ? ` Garrison Pro gives a server ${AI_SUPPLIES_PER_DAY.pro} supplies a day of its own.`
    : "";

/** Not enough supplies left today, in plain words. */
export function suppliesMessage(a: Pick<AiAllowance, "tier" | "suppliesPerDay" | "perPerson">) {
  return a.perPerson
    ? `You've used your ${a.suppliesPerDay} AI builder supplies for today on Free servers. They come back ${resetAt()}.${upgradeLine(a.tier)}`
    : `This server has used today's ${a.suppliesPerDay} AI builder supplies. They come back ${resetAt()}.${upgradeLine(a.tier)}`;
}

/** Why an AI call can't start, in plain words. */
export function limitMessage(
  reason: "supplies" | "person" | "hourly" | "budget",
  a: Pick<AiAllowance, "tier" | "suppliesPerDay" | "perPerson">,
) {
  if (reason === "supplies" || reason === "person") return suppliesMessage(a);
  if (reason === "hourly")
    return "That's a lot of AI builder use in one hour. Try again in a little while.";
  return `The AI builder has reached its limit for today across all servers. It's back ${resetAt()}.`;
}

export type ApplyOutcome =
  | { ok: true; build: QmBuild; created: QmCreated[]; failed: string | null }
  | { ok: false; error: string };

/**
 * Run a pending plan. It's claimed first (pending -> applied), so a double
 * click applies once. Each created object is recorded as soon as it exists,
 * so Undo can clean up even after a failure partway through.
 */
export async function applyBuild(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
): Promise<ApplyOutcome> {
  if (Date.now() - build.createdAt.getTime() > PLAN_TTL_MS) {
    await transitionQmBuild(ctx.db, build.id, "pending", "expired");
    return {
      ok: false,
      error: "That plan expired. Plans last 15 minutes: ask again with /qm build.",
    };
  }
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (
    build.plan.length &&
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
      settingsLookup(guild, build.plan),
      ent,
    );
    if (!now.ok)
      return {
        ok: false,
        error: `This plan's settings can't be applied now: ${now.errors.slice(0, 2).join(" ")}`,
      };
  }
  const claimed = await transitionQmBuild(ctx.db, build.id, "pending", "applied", {
    appliedAt: new Date(),
  });
  if (!claimed) return { ok: false, error: "That plan was already applied, canceled or expired." };

  const ids = new Map<string, string>();
  const created: QmCreated[] = [];
  const reason = `AI builder v${build.version} · requested by ${build.requestedByTag}`;
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
          type: op.kind === "create_voice_channel" ? ChannelType.GuildVoice : ChannelType.GuildText,
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
  if (!ent) return { ok: true, build: claimed, created, failed: null };

  // Settings, once the channels and roles they point at exist: checked against the values
  // as they are now, then the plan's refs swapped for what the build just made.
  try {
    const checked = await checkQmSettings(
      ctx.db,
      guild.id,
      proposalsOf(settings),
      settingsLookup(guild, build.plan),
      ent,
    );
    if (!checked.ok) throw new SettingsRefused(checked.errors.slice(0, 2).join(" "));
    const changes = checked.changes.map((c) => ({ ...c, to: resolveQmSettingRefs(c, ids) }));
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
        username: `${build.requestedByTag} (AI builder v${build.version})`,
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
    return { ok: true, build: claimed, created, failed: null };
  } catch (error) {
    ctx.logger.warn("Quartermaster settings failed", {
      guildId: guild.id,
      version: build.version,
      error,
    });
    const failed = `The settings couldn't be changed${
      error instanceof SettingsRefused ? `: ${error.message}` : ""
    }. Use Undo to remove what was created.`;
    await transitionQmBuild(ctx.db, build.id, "applied", "failed", { error: failed });
    return { ok: true, build: claimed, created, failed };
  }
}

class SettingsRefused extends Error {}

/** What an undo did to settings, as a sentence, or "" when the build changed none. */
export function undoSettingsNote(s: { undone: number; changedSince: number }) {
  const parts = [
    s.undone ? `put back ${s.undone} module${s.undone === 1 ? "'s" : "s'"} settings` : null,
    s.changedSince
      ? `left ${s.changedSince} as they are, because someone changed them since`
      : null,
  ].filter(Boolean);
  return parts.length ? ` Settings: ${parts.join("; ")}.` : "";
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
    }
  | { ok: false; error: string };

/** Remove exactly what a build created, and nothing else. */
export async function undoBuild(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  actorId: string,
  actorName = "AI builder",
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
  const reason = `AI builder: undo v${build.version}`;
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
        username: `${actorName} (undo AI builder v${build.version})`,
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
  return { ok: true, removed, missing, failed, settings };
}
