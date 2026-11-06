import { getActiveLockdown, updateGatehouseSettings } from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import { ChannelType, type Guild, PermissionFlagsBits } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { createLogger } from "../../lib/logger.js";
import { LOCK_BITS } from "./plan.js";
import { invalidateGatehouseSettings, lockGuild, unlockGuild } from "./service.js";

type Ow = { id: string; type: number; allow: bigint; deny: bigint };

/**
 * A guild just real enough for lockGuild/unlockGuild. Overwrites live in a
 * map that the fake REST client edits, so a lock followed by an unlock must
 * leave the map exactly as it started.
 */
function fakeGuild(id: string, channels: { id: string; type: ChannelType; overwrites: Ow[] }[]) {
  const state = new Map(
    channels.map((c) => [c.id, new Map(c.overwrites.map((o) => [o.id, { ...o }]))]),
  );
  const incidents: unknown[] = [];
  const channelCache = new Map(
    channels.map((c) => [
      c.id,
      {
        id: c.id,
        type: c.type,
        permissionOverwrites: {
          get cache() {
            return [...(state.get(c.id)?.values() ?? [])].map((o) => ({
              id: o.id,
              type: o.type,
              allow: { bitfield: o.allow },
              deny: { bitfield: o.deny },
            }));
          },
        },
      },
    ]),
  );
  const parse = (route: string) => {
    const [, , channelId, , targetId] = route.split("/");
    return { channelId: channelId ?? "", targetId: targetId ?? "" };
  };
  const guild = {
    id,
    name: `Guild ${id}`,
    roles: { everyone: { id } },
    members: { me: { id: "bot", permissions: { has: () => true } } },
    channels: { cache: channelCache, fetch: async () => null },
    setIncidentActions: async (a: unknown) => incidents.push(a),
    client: {
      rest: {
        put: async (
          route: string,
          opts: { body: { type: number; allow: string; deny: string } },
        ) => {
          const { channelId, targetId } = parse(route);
          state.get(channelId)?.set(targetId, {
            id: targetId,
            type: opts.body.type,
            allow: BigInt(opts.body.allow),
            deny: BigInt(opts.body.deny),
          });
        },
        delete: async (route: string) => {
          const { channelId, targetId } = parse(route);
          state.get(channelId)?.delete(targetId);
        },
      },
    },
  };
  const snapshot = () =>
    JSON.stringify(
      [...state].map(([k, v]) => [k, [...v.values()]]),
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    );
  return { guild: guild as unknown as Guild, state, incidents, snapshot };
}

let ctx: BotContext;
let close: () => Promise<void>;
beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  ctx = { db: t.db, logger: createLogger("error") };
});
afterAll(() => close());

const actor = { id: "mod", tag: "taner" };
const lockReq = {
  source: "manual" as const,
  reason: "test",
  actorId: "mod",
  actorTag: "taner",
  durationMinutes: 15,
  pauseInvites: true,
};

describe("lockdown end to end", () => {
  it("locks visible channels, exempts staff, and restores everything exactly", async () => {
    const G = "100";
    const { guild, state, incidents, snapshot } = fakeGuild(G, [
      { id: "general", type: ChannelType.GuildText, overwrites: [] },
      {
        id: "lfg",
        type: ChannelType.GuildText,
        overwrites: [{ id: G, type: 0, allow: PermissionFlagsBits.AttachFiles, deny: 0n }],
      },
      {
        id: "staff",
        type: ChannelType.GuildText,
        overwrites: [{ id: G, type: 0, allow: 0n, deny: PermissionFlagsBits.ViewChannel }],
      },
      { id: "category", type: ChannelType.GuildCategory, overwrites: [] },
    ]);
    await ensureGuild(ctx, guild);
    await updateGatehouseSettings(ctx.db, G, { staffRoleIds: ["mods"] });
    invalidateGatehouseSettings(G);
    const original = snapshot();

    const locked = await lockGuild(ctx, guild, lockReq);
    expect(locked).toMatchObject({ ok: true, channels: 2, failed: 0 });
    expect(state.get("general")?.get(G)?.deny).toBe(LOCK_BITS);
    expect(state.get("general")?.get("mods")?.allow).toBe(LOCK_BITS);
    expect(state.get("lfg")?.get(G)).toMatchObject({
      allow: PermissionFlagsBits.AttachFiles,
      deny: LOCK_BITS,
    });
    expect(state.get("staff")?.size).toBe(1); // private channel untouched
    expect(incidents).toHaveLength(1);

    expect(await lockGuild(ctx, guild, lockReq)).toMatchObject({ ok: false });

    const lifted = await unlockGuild(ctx, guild, actor);
    expect(lifted).toMatchObject({ ok: true, restored: 4, failed: 0 });
    expect(snapshot()).toBe(original);
    expect(incidents.at(-1)).toEqual({ invitesDisabledUntil: null });
    expect(await getActiveLockdown(ctx.db, G)).toBeNull();
    expect(await unlockGuild(ctx, guild, actor)).toEqual({
      ok: false,
      error: "No lockdown is active.",
    });
  });

  it("refuses without Manage Channels and Manage Roles", async () => {
    const { guild } = fakeGuild("200", []);
    (guild.members.me as unknown as { permissions: { has: () => boolean } }).permissions.has = () =>
      false;
    const result = await lockGuild(ctx, guild, lockReq);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toContain("Manage Channels or Manage Roles");
  });
});
