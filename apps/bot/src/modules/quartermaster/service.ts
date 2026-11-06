import {
  countRecentQmBuilds,
  createQmPlan,
  type QmBuild,
  type QmCreated,
  recordQmCreated,
  transitionQmBuild,
} from "@garrison/db";
import { ChannelType, type Guild, type OverwriteResolvable, PermissionFlagsBits } from "discord.js";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { rollbackOrder, type ServerSnapshot, validatePlan } from "./plan.js";
import type { Planner, PlannerInput } from "./planner.js";

export const BUILDS_PER_HOUR = 5;
export const PLAN_TTL_MS = 15 * 60_000;
export const REQUEST_MAX = 500;

/** What a private channel's roles may do. Nothing that moderates or manages. */
const CHANNEL_ACCESS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
];

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
  | { ok: true; build: QmBuild; server: ServerSnapshot; notes: string }
  | { ok: false; error: string };

export async function planBuild(
  ctx: BotContext,
  planner: Planner,
  guild: Guild,
  requester: { id: string; tag: string },
  request: string,
): Promise<PlanOutcome> {
  await ensureGuild(ctx, guild);
  if (
    (await countRecentQmBuilds(ctx.db, guild.id, new Date(Date.now() - 3_600_000))) >=
    BUILDS_PER_HOUR
  ) {
    return {
      ok: false,
      error: `This server has used its ${BUILDS_PER_HOUR} builds for this hour. Try again later.`,
    };
  }
  const snap = snapshot(guild);
  const result = await planner.plan({ request, ...snap });
  if (!result.ok) return result;
  const checked = validatePlan(result.plan, snap.server);
  if (!checked.ok) {
    ctx.logger.info("Quartermaster plan rejected", { guildId: guild.id, errors: checked.errors });
    return {
      ok: false,
      error: `I couldn't make a safe plan from that:\n${checked.errors
        .slice(0, 5)
        .map((e) => `- ${e}`)
        .join("\n")}`,
    };
  }
  const build = await createQmPlan(ctx.db, {
    guildId: guild.id,
    requestedById: requester.id,
    requestedByTag: requester.tag,
    prompt: request,
    summary: checked.summary,
    plan: checked.operations,
    model: result.model,
  });
  return { ok: true, build, server: snap.server, notes: checked.notes };
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
  if (!me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
    return {
      ok: false,
      error:
        "I'm missing Manage Channels or Manage Roles, so I can't build. Run /health for a fix link.",
    };
  }
  const claimed = await transitionQmBuild(ctx.db, build.id, "pending", "applied", {
    appliedAt: new Date(),
  });
  if (!claimed) return { ok: false, error: "That plan was already applied, cancelled or expired." };

  const ids = new Map<string, string>();
  const created: QmCreated[] = [];
  const reason = `Quartermaster v${build.version} · requested by ${build.requestedByTag}`;
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
          permissions: [], // Never any server-wide permissions.
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
        const overwrites: OverwriteResolvable[] = op.privateTo.length
          ? [
              { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
              ...op.privateTo.map((r) => ({ id: resolve(r), allow: CHANNEL_ACCESS })),
            ]
          : [];
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
    return { ok: true, build: claimed, created, failed: null };
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
}

export type UndoOutcome =
  | { ok: true; removed: number; missing: number; failed: number }
  | { ok: false; error: string };

/** Remove exactly what a build created, and nothing else. */
export async function undoBuild(
  ctx: BotContext,
  guild: Guild,
  build: QmBuild,
  actorId: string,
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
  const reason = `Quartermaster: undo v${build.version}`;
  let removed = 0;
  let missing = 0;
  let failed = 0;
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
  return { ok: true, removed, missing, failed };
}
