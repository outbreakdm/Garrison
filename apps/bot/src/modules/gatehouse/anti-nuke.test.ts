import { updateGatehouseSettings } from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import {
  AuditLogEvent,
  Collection,
  type Guild,
  type GuildAuditLogsEntry,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { ensureGuild } from "../../lib/guild-registry.js";
import { createLogger } from "../../lib/logger.js";
import { handleAuditLogEntry, recordModeratorAction, restoreQuarantine } from "./anti-nuke.js";

const { Administrator, BanMembers, SendMessages } = PermissionFlagsBits;

interface FakeRole {
  id: string;
  position: number;
  managed: boolean;
  perms: bigint;
}

/** A guild with real role bookkeeping: removing a role really removes its permissions. */
function fakeGuild(id: string, opts: { bot?: boolean } = {}) {
  const roles = new Map<string, FakeRole>([
    [id, { id, position: 0, managed: false, perms: SendMessages }],
    ["member", { id: "member", position: 1, managed: false, perms: 0n }],
    ["admin", { id: "admin", position: 5, managed: false, perms: Administrator }],
    ["garrison", { id: "garrison", position: 10, managed: true, perms: Administrator }],
  ]);
  const held = new Map<string, Set<string>>([
    ["rogue", new Set([id, "member", "admin"])],
    ["owner", new Set([id])],
    ["friend", new Set([id])],
    ["mod", new Set([id])],
  ]);
  const alerts: { title?: string; components: number }[] = [];
  const kicked: string[] = [];
  const everyone = {
    id,
    get permissions() {
      return { bitfield: roles.get(id)?.perms ?? 0n };
    },
    setPermissions: async (bits: bigint) => {
      const role = roles.get(id);
      if (role) role.perms = bits;
    },
  };

  const memberFor = (userId: string): GuildMember => {
    const self = {
      id: userId,
      user: { id: userId, username: userId, bot: opts.bot ?? false },
      kickable: true,
      kick: async () => kicked.push(userId),
      get roles() {
        const cache = new Collection<string, FakeRole>();
        for (const r of held.get(userId) ?? []) {
          const role = roles.get(r);
          if (role) cache.set(r, role);
        }
        return {
          cache,
          remove: async (ids: string[]) => {
            for (const r of ids) held.get(userId)?.delete(r);
          },
          add: async (ids: string[]) => {
            for (const r of ids) held.get(userId)?.add(r);
          },
        };
      },
      get permissions() {
        const bits = [...(held.get(userId) ?? [])].reduce(
          (acc, r) => acc | (roles.get(r)?.perms ?? 0n),
          0n,
        );
        return { any: (b: bigint) => (bits & b) !== 0n };
      },
      fetch: async () => self,
    };
    return self as unknown as GuildMember;
  };

  const guild = {
    id,
    name: id,
    ownerId: "owner",
    roles: { everyone, cache: roles },
    members: {
      me: {
        id: "garrison-bot",
        roles: { highest: { position: 10 } },
        permissions: { has: () => true },
      },
      fetch: async (userId: string) => (held.has(userId) ? memberFor(userId) : null),
    },
    channels: {
      cache: new Map([
        [
          "alerts",
          {
            isSendable: () => true,
            // Sent in the layout components: one card, its heading first, its buttons last.
            send: async (m: {
              components: { components: { type: number; content?: string }[] }[];
            }) => {
              const card = m.components[0]?.components ?? [];
              alerts.push({
                title: card[0]?.content?.replace(/^### /, ""),
                components: card.filter((c) => c.type === 1).length,
              });
            },
          },
        ],
      ]),
      fetch: async () => null,
    },
  };
  return { guild: guild as unknown as Guild, held, roles, alerts, kicked, memberFor };
}

const entry = (
  action: AuditLogEvent,
  executorId: string,
  extra: Partial<GuildAuditLogsEntry> = {},
) =>
  ({ action, executorId, targetId: "x", changes: [], ...extra }) as unknown as GuildAuditLogsEntry;

let ctx: BotContext;
let close: () => Promise<void>;
beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  ctx = { db: t.db, logger: createLogger("error") };
});
afterAll(() => close());

async function setup(id: string, opts?: { bot?: boolean }) {
  const f = fakeGuild(id, opts);
  await ensureGuild(ctx, f.guild);
  await updateGatehouseSettings(ctx.db, id, {
    alertChannelId: "alerts",
    antiNukeTrustedIds: ["friend"],
  });
  return f;
}

describe("anti-nuke", () => {
  it("quarantines a rogue admin who deletes channels, and only the owner can restore", async () => {
    const f = await setup("n1");
    for (let i = 0; i < 2; i++)
      await handleAuditLogEntry(ctx, entry(AuditLogEvent.ChannelDelete, "rogue"), f.guild);
    expect(f.held.get("rogue")?.has("admin")).toBe(true);

    await handleAuditLogEntry(ctx, entry(AuditLogEvent.RoleDelete, "rogue"), f.guild);
    expect([...(f.held.get("rogue") ?? [])]).toEqual(["n1"]);
    expect(f.alerts.at(-1)).toEqual({ title: "Quarantined rogue", components: 1 });

    const q = await ctx.db.query.quarantines.findFirst();
    expect(q?.removedRoleIds.sort()).toEqual(["admin", "member"]);

    const denied = await restoreQuarantine(ctx, f.guild, q?.id ?? "", f.memberFor("mod"));
    expect(denied).toMatchObject({ ok: false });
    const restored = await restoreQuarantine(ctx, f.guild, q?.id ?? "", f.memberFor("owner"));
    expect(restored).toMatchObject({ ok: true, restored: 2 });
    expect(f.held.get("rogue")?.has("admin")).toBe(true);
    expect(await restoreQuarantine(ctx, f.guild, q?.id ?? "", f.memberFor("owner"))).toMatchObject({
      ok: false,
    });
  });

  it("never acts on the owner, trusted users or Garrison itself", async () => {
    const f = await setup("n2");
    for (const actor of ["owner", "friend", "garrison-bot"]) {
      for (let i = 0; i < 5; i++)
        await handleAuditLogEntry(ctx, entry(AuditLogEvent.ChannelDelete, actor), f.guild);
    }
    expect(f.alerts).toEqual([]);
  });

  it("reverts dangerous permissions given to @everyone and quarantines whoever did it", async () => {
    const f = await setup("n3");
    const after = SendMessages | Administrator | BanMembers;
    await f.guild.roles.everyone.setPermissions(after);
    await handleAuditLogEntry(
      ctx,
      entry(AuditLogEvent.RoleUpdate, "rogue", {
        targetId: "n3",
        changes: [{ key: "permissions", old: SendMessages.toString(), new: after.toString() }],
      } as Partial<GuildAuditLogsEntry>),
      f.guild,
    );
    expect(f.roles.get("n3")?.perms).toBe(SendMessages);
    expect(f.held.get("rogue")?.has("admin")).toBe(false);
  });

  it("counts bans made through Garrison's /ban against the moderator", async () => {
    const f = await setup("n4");
    for (let i = 0; i < 5; i++) await recordModeratorAction(ctx, f.guild, "rogue");
    expect(f.held.get("rogue")?.has("admin")).toBe(false);
  });

  it("kicks a rogue bot instead of stripping its roles", async () => {
    const f = await setup("n5", { bot: true });
    for (let i = 0; i < 3; i++)
      await handleAuditLogEntry(ctx, entry(AuditLogEvent.ChannelDelete, "rogue"), f.guild);
    expect(f.kicked).toEqual(["rogue"]);
  });

  it("does nothing when the owner has turned it off", async () => {
    const f = fakeGuild("n6");
    await ensureGuild(ctx, f.guild);
    await updateGatehouseSettings(ctx.db, "n6", { antiNukeEnabled: false });
    for (let i = 0; i < 5; i++)
      await handleAuditLogEntry(ctx, entry(AuditLogEvent.ChannelDelete, "rogue"), f.guild);
    expect(f.held.get("rogue")?.has("admin")).toBe(true);
  });
});
