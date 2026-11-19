import { createQmPlan, getQmBuild, type QmEdit, upsertGuild } from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import {
  ChannelType,
  Collection,
  type Guild,
  OverwriteType,
  PermissionFlagsBits as P,
  PermissionsBitField,
} from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import { applyBuild, undoBuild } from "./service.js";

/**
 * Applying and undoing edits against a small stand-in for Discord: channels with real
 * overwrite collections, roles with permission bitfields, and edit, delete and
 * lockPermissions that change them the way Discord would.
 */

type Ow = {
  id: string;
  type: OverwriteType;
  allow: PermissionsBitField;
  deny: PermissionsBitField;
};
const ow = (id: string, type: OverwriteType, allow: bigint, deny: bigint): Ow => ({
  id,
  type,
  allow: new PermissionsBitField(allow),
  deny: new PermissionsBitField(deny),
});

function fakeServer(id: string) {
  const deleted: string[] = [];
  const channels = new Collection<string, Record<string, unknown>>();
  const roles = new Collection<string, Record<string, unknown>>();
  const channel = (
    cid: string,
    name: string,
    type: ChannelType,
    parentId: string | null,
    overwrites: Ow[] = [],
  ) => {
    const c: Record<string, unknown> = {
      id: cid,
      name,
      type,
      parentId,
      topic: type === ChannelType.GuildText ? "old topic" : undefined,
      rateLimitPerUser: type === ChannelType.GuildText ? 0 : undefined,
      nsfw: false,
      permissionsLocked: false,
      permissionOverwrites: { cache: new Collection(overwrites.map((o) => [o.id, o])) },
      isThread: () => false,
      isDMBased: () => false,
      delete: async () => {
        deleted.push(cid);
        channels.delete(cid);
      },
      edit: async (patch: Record<string, unknown>) => {
        for (const k of ["name", "topic", "nsfw"]) if (k in patch) c[k] = patch[k];
        if ("rateLimitPerUser" in patch) c.rateLimitPerUser = patch.rateLimitPerUser;
        if ("parent" in patch) c.parentId = patch.parent;
        if (patch.permissionOverwrites) {
          const list = patch.permissionOverwrites as {
            id: string;
            type: OverwriteType;
            allow: bigint;
            deny: bigint;
          }[];
          c.permissionOverwrites = {
            cache: new Collection(list.map((o) => [o.id, ow(o.id, o.type, o.allow, o.deny)])),
          };
          c.permissionsLocked = false;
        }
        return c;
      },
      lockPermissions: async () => {
        const parent = channels.get(String(c.parentId));
        const cache =
          (parent?.permissionOverwrites as { cache: Collection<string, Ow> } | undefined)?.cache ??
          new Collection<string, Ow>();
        c.permissionOverwrites = { cache: new Collection(cache) };
        c.permissionsLocked = true;
      },
    };
    channels.set(cid, c);
    return c;
  };
  const role = (rid: string, name: string, position: number, perms: bigint, managed = false) => {
    const r: Record<string, unknown> = {
      id: rid,
      name,
      position,
      managed,
      color: 0,
      hoist: false,
      mentionable: false,
      permissions: new PermissionsBitField(perms),
      delete: async () => {
        deleted.push(rid);
        roles.delete(rid);
      },
      edit: async (patch: Record<string, unknown>) => {
        for (const k of ["name", "color", "hoist", "mentionable"]) if (k in patch) r[k] = patch[k];
        if ("permissions" in patch)
          r.permissions = new PermissionsBitField(patch.permissions as bigint);
        return r;
      },
    };
    roles.set(rid, r);
    return r;
  };
  role(id, "@everyone", 0, P.ViewChannel | P.SendMessages);
  role(`${id}9`, "Staff", 8, P.ManageMessages);
  role(`${id}2`, "Members", 2, P.AttachFiles | P.SendPolls);
  role(`${id}3`, "Old Role", 1, 0n);
  // A category whose two channels: one follows it, one has its own permissions.
  const cat = channel(`${id}10`, "Community", ChannelType.GuildCategory, null, []);
  const follower = channel(`${id}11`, "general", ChannelType.GuildText, `${id}10`, []);
  follower.permissionsLocked = true;
  channel(`${id}12`, "clips", ChannelType.GuildText, `${id}10`, [
    ow(`${id}2`, OverwriteType.Role, P.AttachFiles, 0n),
  ]);
  // A channel the Staff role can see through its own overwrite.
  channel(`${id}13`, "lounge", ChannelType.GuildText, null, [
    ow(`${id}9`, OverwriteType.Role, P.ViewChannel, 0n),
    ow(`${id}3`, OverwriteType.Role, P.ViewChannel, 0n),
  ]);
  channel(`${id}14`, "old-chat", ChannelType.GuildText, null, []);
  const guild = {
    id,
    name: id,
    rulesChannelId: null,
    publicUpdatesChannelId: null,
    safetyAlertsChannelId: null,
    roles: { everyone: { id }, cache: roles },
    channels: { cache: channels },
    members: {
      me: {
        id: "garrison",
        permissions: { has: () => true },
        roles: { highest: { position: 10 } },
      },
    },
  };
  void cat;
  return { guild: guild as unknown as Guild, channels, roles, deleted };
}

let ctx: BotContext;
let close: () => Promise<void>;
beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  ctx = { db: t.db, logger: createLogger("error") };
});
afterAll(() => close());

async function build(guildId: string, edits: QmEdit[]) {
  await upsertGuild(ctx.db, { id: guildId, name: guildId });
  return createQmPlan(ctx.db, {
    guildId,
    requestedById: "1",
    requestedByTag: "admin",
    prompt: "tidy up",
    summary: "Tidy up",
    plan: [],
    edits,
    model: "test",
  });
}

const overwritesOf = (c: Record<string, unknown> | undefined) =>
  [
    ...((
      c?.permissionOverwrites as { cache: Collection<string, Ow> } | undefined
    )?.cache.values() ?? []),
  ].map((o) => ({
    id: o.id,
    allow: o.allow.bitfield,
    deny: o.deny.bitfield,
  }));

describe("applying edits, and Undo putting them back", () => {
  it("makes a channel private and renames it, edits a role, and Undo restores both exactly", async () => {
    const g = "500000000000000001";
    const f = fakeServer(g);
    const lounge = f.channels.get(`${g}13`);
    const before = overwritesOf(lounge);
    const stored = await build(g, [
      {
        kind: "edit_channel",
        id: `${g}13`,
        was: "lounge",
        name: "members-lounge",
        access: { privateTo: [`${g}2`], readOnly: false, posters: [] },
      },
      {
        kind: "edit_role",
        id: `${g}2`,
        was: "Members",
        color: 0x00ff00,
        permissions: ["embed_links"],
      },
    ]);
    const out = await applyBuild(ctx, f.guild, stored);
    expect(out).toMatchObject({ ok: true, failed: null });

    expect(lounge?.name).toBe("members-lounge");
    const after = new Map(overwritesOf(lounge).map((o) => [o.id, o]));
    // Hidden from @everyone, visible to Members and to Garrison itself.
    expect(after.get(g)?.deny ?? 0n).toBe(P.ViewChannel);
    expect((after.get(`${g}2`)?.allow ?? 0n) & P.ViewChannel).toBe(P.ViewChannel);
    expect((after.get("garrison")?.allow ?? 0n) & P.ViewChannel).toBe(P.ViewChannel);
    // A plain role's explicit "can see" goes; the staff role keeps its own.
    expect(after.has(`${g}3`)).toBe(false);
    expect(after.get(`${g}9`)?.allow).toBe(P.ViewChannel);

    const members = f.roles.get(`${g}2`);
    expect(members?.color).toBe(0x00ff00);
    // Only the givable permissions changed: Create Polls isn't one, so it stays.
    const perms = (members?.permissions as PermissionsBitField | undefined)?.bitfield ?? 0n;
    expect(perms & P.EmbedLinks).toBe(P.EmbedLinks);
    expect(perms & P.AttachFiles).toBe(0n);
    expect(perms & P.SendPolls).toBe(P.SendPolls);

    const applied = await getQmBuild(ctx.db, g, stored.id);
    if (!applied) throw new Error("build missing");
    const undone = await undoBuild(ctx, f.guild, applied, "1");
    expect(undone).toMatchObject({ ok: true, removed: 2, failed: 0, deleted: 0 });
    expect(lounge?.name).toBe("lounge");
    expect(overwritesOf(lounge)).toEqual(before);
    expect(f.roles.get(`${g}2`)?.color).toBe(0);
    expect((f.roles.get(`${g}2`)?.permissions as PermissionsBitField | undefined)?.bitfield).toBe(
      P.AttachFiles | P.SendPolls,
    );
  });

  it("keeps a category's following channels in step, and Undo puts them all back", async () => {
    const g = "500000000000000002";
    const f = fakeServer(g);
    const stored = await build(g, [
      {
        kind: "edit_category",
        id: `${g}10`,
        was: "Community",
        access: { privateTo: [`${g}2`], readOnly: false, posters: [] },
      },
    ]);
    expect(await applyBuild(ctx, f.guild, stored)).toMatchObject({ ok: true, failed: null });
    const general = f.channels.get(`${g}11`);
    const clips = f.channels.get(`${g}12`);
    // general followed the category, so it's private now too; clips had its own and keeps it.
    expect(overwritesOf(general).find((o) => o.id === g)?.deny).toBe(P.ViewChannel);
    expect(overwritesOf(clips)).toEqual([{ id: `${g}2`, allow: P.AttachFiles, deny: 0n }]);

    const applied = await getQmBuild(ctx.db, g, stored.id);
    if (!applied) throw new Error("build missing");
    await undoBuild(ctx, f.guild, applied, "1");
    expect(overwritesOf(f.channels.get(`${g}10`))).toEqual([]);
    expect(overwritesOf(general)).toEqual([]);
  });

  it("deletes last, records it, and Undo says it can't bring it back", async () => {
    const g = "500000000000000003";
    const f = fakeServer(g);
    const stored = await build(g, [
      { kind: "edit_channel", id: `${g}12`, was: "clips", topic: "Your best plays" },
      { kind: "delete_channel", id: `${g}14`, was: "old-chat" },
      { kind: "delete_role", id: `${g}3`, was: "Old Role" },
    ]);
    const out = await applyBuild(ctx, f.guild, stored);
    expect(out).toMatchObject({ ok: true, failed: null });
    expect(f.deleted).toEqual([`${g}14`, `${g}3`]);
    expect(f.channels.get(`${g}12`)?.topic).toBe("Your best plays");

    const applied = await getQmBuild(ctx.db, g, stored.id);
    if (!applied) throw new Error("build missing");
    expect(applied.created.map((c) => c.kind)).toEqual(["edit", "deleted", "deleted"]);
    const undone = await undoBuild(ctx, f.guild, applied, "1");
    expect(undone).toMatchObject({ ok: true, removed: 1, deleted: 2 });
    expect(f.channels.get(`${g}12`)?.topic).toBe("old topic");
  });

  it("re-checks at apply time: a role that gained staff powers since is left alone", async () => {
    const g = "500000000000000004";
    const f = fakeServer(g);
    const stored = await build(g, [{ kind: "delete_role", id: `${g}3`, was: "Old Role" }]);
    // Someone gave it Ban Members after the plan was drafted.
    (f.roles.get(`${g}3`) as Record<string, unknown>).permissions = new PermissionsBitField(
      P.BanMembers,
    );
    const out = await applyBuild(ctx, f.guild, stored);
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(out.failed).toMatch(/staff powers/);
    expect(f.deleted).toEqual([]);
  });
});
