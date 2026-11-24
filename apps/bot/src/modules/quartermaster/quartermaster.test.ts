import {
  AI_SUPPLIES_PER_MONTH,
  aiAllowance,
  aiSpendSince,
  applySettingsChange,
  blankCard,
  costMicros,
  listSettingsChanges,
  type QmPostProposal,
  type QmSettingProposal,
  qmReserveMicros,
  readSettings,
  schema,
  suppliesUsed,
  upsertGuild,
} from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import {
  ChannelType,
  Collection,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import { chatTurn } from "./chat.js";
import type { AiPlan } from "./plan.js";
import type { ChatInput, Planner, PlannerInput } from "./planner.js";
import {
  applyBuild,
  channelOverwrites,
  planBuild,
  undoBuild,
  undoSettingsNote,
} from "./service.js";

/** Saved messages a build posts go through the dashboard's post request; here, recorded. */
const posted = vi.hoisted(() => [] as { member: string; raw: unknown }[]);
vi.mock("../dispatch/service.js", () => ({
  postMessageNow: async (_ctx: unknown, _guild: unknown, member: { id: string }, raw: unknown) => {
    posted.push({ member: member.id, raw });
    return { ok: true, message: "Posted." };
  },
}));

type Op = AiPlan["operations"][number];
const op = (o: Partial<Op> & Pick<Op, "kind" | "ref" | "name">): Op => ({
  text_kind: null,
  parent: null,
  topic: null,
  slowmode_seconds: null,
  user_limit: null,
  private_to: [],
  read_only: null,
  posters: [],
  color_hex: null,
  hoist: null,
  mentionable: null,
  permissions: [],
  ...o,
});
/** A typical message's tokens: $0.00262, so 3 supplies. */
const TYPICAL = { model: "claude-haiku-5-5", inputTokens: 6700, outputTokens: 3900 };
const stub = (plan: AiPlan): Planner => ({
  plan: async () => ({ ok: true, plan, model: "stub", usage: TYPICAL }),
});

/** A guild that records every create/delete. `failOn` makes the Nth create throw. */
function fakeGuild(id: string, failOn?: number) {
  let n = 0;
  let creates = 0;
  const calls: { kind: string; options: Record<string, unknown> }[] = [];
  const deleted: string[] = [];
  const channels = new Collection<
    string,
    {
      id: string;
      name: string;
      type: ChannelType;
      isThread: () => boolean;
      rawPosition?: number;
      parentId?: string | null;
      delete: () => Promise<void>;
    }
  >();
  const roles = new Collection<
    string,
    {
      id: string;
      name: string;
      managed: boolean;
      position: number;
      permissions: PermissionsBitField;
      delete: () => Promise<void>;
    }
  >();
  roles.set(id, {
    id,
    name: "@everyone",
    managed: false,
    position: 0,
    permissions: new PermissionsBitField(),
    delete: async () => {},
  });
  const make = async (kind: string, options: Record<string, unknown>) => {
    if (failOn !== undefined && ++creates === failOn) throw new Error("Missing Permissions");
    const newId = `${id}-${++n}`;
    calls.push({ kind, options });
    const del = async () => {
      deleted.push(newId);
      channels.delete(newId);
      roles.delete(newId);
    };
    if (kind === "role")
      roles.set(newId, {
        id: newId,
        name: String(options.name),
        managed: false,
        position: 1,
        permissions: new PermissionsBitField(),
        delete: del,
      });
    else
      channels.set(newId, {
        id: newId,
        name: String(options.name),
        type: options.type as ChannelType,
        isThread: () => false,
        // Discord puts a new channel at the bottom of its list.
        rawPosition: 100 + n,
        parentId: (options.parent as string | undefined) ?? null,
        delete: del,
      });
    return { id: newId, name: String(options.name) };
  };
  /** Every setPositions call: which list, and the ids top to bottom after it. */
  const moves: { kind: "roles" | "channels"; to: { id: string; position: number }[] }[] = [];
  const guild = {
    id,
    name: id,
    roles: {
      everyone: { id },
      cache: roles,
      create: (o: Record<string, unknown>) => make("role", o),
      setPositions: async (list: { role: string; position: number }[]) => {
        moves.push({ kind: "roles", to: list.map((x) => ({ id: x.role, position: x.position })) });
        for (const x of list) {
          const r = roles.get(x.role);
          if (r) r.position = x.position;
        }
      },
    },
    channels: {
      cache: channels,
      create: (o: Record<string, unknown>) => make("channel", o),
      setPositions: async (list: { channel: string; position: number }[]) => {
        moves.push({
          kind: "channels",
          to: list.map((x) => ({ id: x.channel, position: x.position })),
        });
        for (const x of list) {
          const c = channels.get(x.channel);
          if (c) c.rawPosition = x.position;
        }
      },
    },
    members: {
      me: {
        id: "garrison",
        permissions: { has: () => true },
        roles: { highest: { position: 10 } },
      },
    },
  };
  return { guild: guild as unknown as Guild, calls, deleted, channels, roles, moves };
}

/** A plan of `n` roles, for counting changes. */
const rolesPlan = (n: number): AiPlan => ({
  summary: `${n} roles`,
  notes: "",
  operations: Array.from({ length: n }, (_, i) =>
    op({ kind: "create_role", ref: `r${i}`, name: `Role ${i}` }),
  ),
});

const sectionPlan: AiPlan = {
  summary: "WARDOGS section",
  notes: "",
  operations: [
    op({ kind: "create_role", ref: "gold", name: "Gold+" }),
    op({ kind: "create_category", ref: "wardogs", name: "WARDOGS" }),
    op({
      kind: "create_text_channel",
      ref: "ranked",
      name: "ranked-lfg",
      parent: "wardogs",
      private_to: ["gold"],
    }),
    op({ kind: "create_voice_channel", ref: "vc", name: "Ranked voice", parent: "wardogs" }),
  ],
};

let ctx: BotContext;
let close: () => Promise<void>;
beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  ctx = { db: t.db, logger: createLogger("error") };
});
afterAll(() => close());
/** A requester of its own per test, so Free's per-person count doesn't carry across tests. */
const asker = (f: { guild: { id: string } }) => ({
  id: `9${f.guild.id.slice(1)}`,
  tag: f.guild.id,
});
/** Free's monthly supplies: tests leave a set number of them by spending the rest. */
const FREE = AI_SUPPLIES_PER_MONTH.free;
/** Supplies this person already used on this server this month, as one earlier AI call. */
async function used(f: { guild: { id: string } }, person: { id: string }, supplies: number) {
  await upsertGuild(ctx.db, { id: f.guild.id, name: f.guild.id });
  await ctx.db.insert(schema.aiUsage).values({
    guildId: f.guild.id,
    feature: "qm_chat",
    requestedBy: person.id,
    model: "claude-haiku-5-5",
    reservedMicros: 0,
    costMicros: supplies * 1000,
    supplies,
    ok: true,
  });
}

describe("Quartermaster end to end", () => {
  it("builds with zero-permission roles and allowlisted channel access, once", async () => {
    const f = fakeGuild("q1");
    const planned = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "a WARDOGS section");
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(f.calls).toHaveLength(0); // Planning changes nothing.

    const applied = await applyBuild(ctx, f.guild, planned.build);
    expect(applied).toMatchObject({ ok: true, failed: null });
    expect(f.calls.map((c) => c.kind)).toEqual(["role", "channel", "channel", "channel"]);
    expect(f.calls[0]?.options.permissions).toEqual([]);

    const ranked = f.calls[2]?.options as {
      parent: string;
      permissionOverwrites: { id: string; allow?: bigint[]; deny?: bigint[] }[];
    };
    expect(ranked.parent).toBe("q1-2");
    const roleAllow = ranked.permissionOverwrites.find((o) => o.id === "q1-1")?.allow ?? [];
    const dangerous = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.MentionEveryone,
    ];
    expect(roleAllow.some((p) => dangerous.includes(p))).toBe(false);
    expect(ranked.permissionOverwrites.find((o) => o.id === "q1")?.deny).toEqual([
      PermissionFlagsBits.ViewChannel,
    ]);

    expect(await applyBuild(ctx, f.guild, planned.build)).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(4);
  });

  it("rejects a hostile plan before touching the server", async () => {
    const f = fakeGuild("q2");
    const hostile: AiPlan = {
      summary: "x",
      notes: "",
      operations: [
        op({ kind: "create_text_channel", ref: "a", name: "a", private_to: ["q2"] }),
        op({ kind: "create_text_channel", ref: "b", name: "b", parent: "not-a-category" }),
      ],
    };
    const planned = await planBuild(ctx, stub(hostile), f.guild, asker(f), "anything");
    expect(planned).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });

  it("records partial builds, and Undo removes exactly what was created", async () => {
    const f = fakeGuild("q3", 3);
    // Something that existed before the build must survive Undo.
    f.channels.set("pre-existing", {
      id: "pre-existing",
      name: "general",
      type: ChannelType.GuildText,
      isThread: () => false,
      delete: async () => {
        throw new Error("should not be deleted");
      },
    });
    const planned = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "a WARDOGS section");
    if (!planned.ok) throw new Error("plan failed");
    const applied = await applyBuild(ctx, f.guild, planned.build);
    expect(applied.ok && applied.failed).toBeTruthy();
    expect(applied.ok && applied.created.map((c) => c.kind)).toEqual(["role", "category"]);

    const { getQmBuild } = await import("@garrison/db");
    const stored = await getQmBuild(ctx.db, "q3", planned.build.id);
    expect(stored?.status).toBe("failed");
    if (!stored) throw new Error("build missing");
    const undone = await undoBuild(ctx, f.guild, stored, "2");
    expect(undone).toEqual({
      ok: true,
      removed: 2,
      missing: 0,
      failed: 0,
      settings: { undone: 0, changedSince: 0 },
      posts: 0,
      deleted: 0,
    });
    expect(f.deleted).toEqual(["q3-2", "q3-1"]); // category before role
    expect(f.channels.has("pre-existing")).toBe(true);
    expect(await undoBuild(ctx, f.guild, { ...stored, status: "applied" }, "2")).toMatchObject({
      ok: false,
    });
  });

  it("puts categories and roles in a new order, keeps staff where they are, and Undo puts it back", async () => {
    const f = fakeGuild("q31");
    const cat = (cid: string, name: string, rawPosition: number) =>
      f.channels.set(cid, {
        id: cid,
        name,
        type: ChannelType.GuildCategory,
        isThread: () => false,
        rawPosition,
        parentId: null,
        delete: async () => {},
      });
    cat("123456789012345101", "Games", 0);
    cat("123456789012345102", "Chat", 1);
    const role = (rid: string, name: string, position: number, bits = 0n) =>
      f.roles.set(rid, {
        id: rid,
        name,
        managed: false,
        position,
        permissions: new PermissionsBitField(bits),
        delete: async () => {},
      });
    role("123456789012345201", "Mods", 6, PermissionFlagsBits.KickMembers);
    role("123456789012345202", "VIP", 5);
    role("123456789012345203", "Pings", 4);
    const order: AiPlan["order"] = [
      {
        scope: "categories",
        parent: null,
        items: ["start", "123456789012345102", "123456789012345101"],
      },
      { scope: "roles", parent: null, items: ["123456789012345203", "123456789012345202"] },
    ];
    const plan: AiPlan = {
      summary: "Start here on top",
      notes: "",
      operations: [op({ kind: "create_category", ref: "start", name: "Start here" })],
      order,
    };
    // Staff stay put: an order that moves Mods is refused before anything happens.
    const refused = await planBuild(
      ctx,
      stub({
        ...plan,
        order: [
          { scope: "roles", parent: null, items: ["123456789012345202", "123456789012345201"] },
        ],
      }),
      f.guild,
      asker(f),
      "VIP above mods",
    );
    expect(refused.ok).toBe(false);

    const planned = await planBuild(ctx, stub(plan), f.guild, asker(f), "tidy up");
    if (!planned.ok) throw new Error(planned.error);
    expect(planned.build.orders.map((o) => o.names)).toEqual([
      ["Start here", "Chat", "Games"],
      ["Pings", "VIP"],
    ]);
    const applied = await applyBuild(ctx, f.guild, planned.build);
    expect(applied).toMatchObject({ ok: true, failed: null });
    const sorted = (kind: "channels" | "roles") =>
      kind === "channels"
        ? [...f.channels.values()]
            .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
            .map((c) => c.name)
        : [...f.roles.values()].sort((a, b) => b.position - a.position).map((r) => r.name);
    expect(sorted("channels")).toEqual(["Start here", "Chat", "Games"]);
    expect(sorted("roles")).toEqual(["Mods", "Pings", "VIP", "@everyone"]);

    const { getQmBuild } = await import("@garrison/db");
    const stored = await getQmBuild(ctx.db, "q31", planned.build.id);
    if (!stored) throw new Error("build missing");
    expect(stored.created.filter((c) => c.kind === "order")).toHaveLength(2);
    const undone = await undoBuild(ctx, f.guild, stored, "2");
    expect(undone).toMatchObject({ ok: true, failed: 0 });
    expect(sorted("roles")).toEqual(["Mods", "VIP", "Pings", "@everyone"]);
    // The made category is gone; the others are back in their old order.
    expect(sorted("channels")).toEqual(["Games", "Chat"]);
  });

  it("counts supplies: a typical message is 3, each change 1, and the rest carry over", async () => {
    const f = fakeGuild("q4");
    const a = asker(f);
    await used(f, a, FREE - 40);
    const first = await planBuild(ctx, stub(rolesPlan(10)), f.guild, a, "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 27 });
    // Built, so its changes stay counted (a new draft would replace a waiting one instead).
    if (first.ok) await applyBuild(ctx, f.guild, first.build);
    const small = await planBuild(ctx, stub(rolesPlan(3)), f.guild, a, "x");
    expect(small).toMatchObject({ ok: true, suppliesLeft: 21 });
    if (small.ok) await applyBuild(ctx, f.guild, small.build);
    // 21 left: the message takes 3, so the next plan may make up to 18. One asking for more
    // is refused whole; its message still costs the 3 its AI used (since 2026-11-20).
    const tooBig = await planBuild(ctx, stub(rolesPlan(19)), f.guild, a, "x");
    expect(!tooBig.ok && tooBig.error).toMatch(/only 18 supplies are left for changes./);
    // 18 left: 3 for the message, 15 for changes.
    const last = await planBuild(ctx, stub(rolesPlan(15)), f.guild, a, "x");
    expect(last).toMatchObject({ ok: true, suppliesLeft: 0 });
    if (last.ok) await applyBuild(ctx, f.guild, last.build);
    const none = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
    expect(!none.ok && none.error).toMatch(
      /this month's 100 AI assistant supplies on Free servers\. They renew <t:\d+:R>.*Garrison Pro gives a server 2,500 supplies a month/,
    );
  });

  it("builds every prompt onto the person's one waiting draft, keeping what's in it", async () => {
    const { getQmBuild, latestWaitingQmBuild } = await import("@garrison/db");
    const f = fakeGuild("q4b");
    const a = asker(f);
    await used(f, a, FREE - 40);
    const first = await planBuild(ctx, stub(rolesPlan(10)), f.guild, a, "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 27 });
    // A second prompt, with nothing said about the first: it goes into the same draft, and
    // the ten roles stay even though this answer didn't repeat them.
    const extra = sectionPlan.operations.length;
    const next = await planBuild(ctx, stub(sectionPlan), f.guild, a, "x");
    expect(next).toMatchObject({ ok: true, suppliesLeft: 40 - 3 - 3 - (10 + extra) });
    if (!first.ok || !next.ok) throw new Error("no draft");
    expect(next.build.version).toBe(first.build.version + 1);
    expect(next.build.plan.map((o) => o.name).slice(0, 10)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Role ${i}`),
    );
    expect(next.build.plan).toHaveLength(10 + extra);
    expect((await getQmBuild(ctx.db, "q4b", first.build.id))?.status).toBe("cancelled");
    expect((await latestWaitingQmBuild(ctx.db, "q4b", a.id))?.id).toBe(next.build.id);
  });

  it("gives the planner what's left after the message as its limit", async () => {
    const f = fakeGuild("q12");
    const a = asker(f);
    await used(f, a, FREE - 40);
    for (const n of [20, 9]) {
      const planned = await planBuild(ctx, stub(rolesPlan(n)), f.guild, a, "x");
      expect(planned.ok).toBe(true);
      if (planned.ok) await applyBuild(ctx, f.guild, planned.build);
    }
    let limit: number | undefined;
    const seeing: Planner = {
      plan: async (input) => {
        limit = input.maxOperations;
        return { ok: true, plan: rolesPlan(2), model: "stub", usage: TYPICAL };
      },
    };
    expect(await planBuild(ctx, seeing, f.guild, a, "x")).toMatchObject({
      ok: true,
      suppliesLeft: 0,
    });
    expect(limit).toBe(2);
  });

  it("counts Free per person across all their Free servers", async () => {
    const [one, two, three] = [fakeGuild("q8"), fakeGuild("q9"), fakeGuild("q10")];
    const owner = { id: "98000", tag: "owner" };
    await used(one, owner, FREE - 40);
    expect((await planBuild(ctx, stub(rolesPlan(20)), one.guild, owner, "x")).ok).toBe(true);
    const second = await planBuild(ctx, stub(rolesPlan(14)), two.guild, owner, "x");
    expect(second).toMatchObject({ ok: true, suppliesLeft: 0 });
    const third = await planBuild(ctx, stub(sectionPlan), three.guild, owner, "x");
    expect(!third.ok && third.error).toMatch(/this month's 100 AI assistant supplies on Free/);
    // Someone else can still use the third server's own supplies.
    const other = { id: "98001", tag: "other" };
    expect((await planBuild(ctx, stub(sectionPlan), three.guild, other, "x")).ok).toBe(true);
  });

  it("charges for every message, so many tiny plans can't run up the AI bill", async () => {
    const f = fakeGuild("q14");
    const a = asker(f);
    await used(f, a, FREE - 40);
    for (let i = 0; i < 10; i++) {
      const planned = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
      expect(planned.ok).toBe(true);
      if (planned.ok) await applyBuild(ctx, f.guild, planned.build);
    }
    const eleventh = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
    expect(!eleventh.ok && eleventh.error).toMatch(/this month's 100 AI assistant supplies/);
  });

  it("gives an Agency plan one pool of 11,000 a month, shared by its servers", async () => {
    const { planBundles } = schema;
    const f = fakeGuild("q11");
    await upsertGuild(ctx.db, { id: "q11", name: "q11" });
    const [bundle] = await ctx.db
      .insert(planBundles)
      .values({ ownerId: "98100", seats: 5, source: "comp" })
      .returning({ id: planBundles.id });
    await ctx.db
      .insert(schema.guildPlans)
      .values({ guildId: "q11", plan: "pro", bundleId: bundle?.id });
    expect(await aiAllowance(ctx.db, "q11", "98100")).toEqual({
      tier: "agency",
      pool: 11_000,
      suppliesLeft: 11_000,
      poolLeft: 11_000,
      packLeft: 0,
      perPerson: false,
      shared: true,
      resetsAt: expect.any(Date),
    });
    const first = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 10_993 });
  });

  it("revises a waiting plan into the next version, which keeps it and adds on", async () => {
    const f = fakeGuild("q13");
    const a = asker(f);
    const v1 = await planBuild(ctx, stub(sectionPlan), f.guild, a, "a WARDOGS section");
    if (!v1.ok) throw new Error(v1.error);
    let told: PlannerInput["continuation"];
    const reviser: Planner = {
      plan: async (input) => {
        told = input.continuation;
        return { ok: true, plan: rolesPlan(6), model: "stub", usage: TYPICAL };
      },
    };
    const v2 = await planBuild(ctx, reviser, f.guild, a, "add two more roles", {
      continues: v1.build,
    });
    // The revision didn't drop v1's 4 changes, so they stay, with the 6 it adds; both
    // messages count: the pool - 3 - 3 - 10.
    expect(v2).toMatchObject({ ok: true, suppliesLeft: FREE - 16 });
    if (!v2.ok) return;
    expect(v2.build.continuesId).toBe(v1.build.id);
    expect(v2.build.plan.map((o) => o.ref)).toEqual([
      "gold",
      "wardogs",
      "ranked",
      "vc",
      ...Array.from({ length: 6 }, (_, i) => `r${i}`),
    ]);
    expect(v2.replaced).toMatchObject({ id: v1.build.id, status: "cancelled" });
    expect(told).toMatchObject({ mode: "revise", history: [{ version: v1.build.version }] });
    expect(told?.mode === "revise" && told.operations.map((o) => o.ref)).toEqual([
      "gold",
      "wardogs",
      "ranked",
      "vc",
    ]);
    // Asking from the replaced version builds on the waiting draft, v2, not on v1.
    const { getQmBuild } = await import("@garrison/db");
    const old = await getQmBuild(ctx.db, "q13", v1.build.id);
    if (!old) throw new Error("v1 missing");
    const again = await planBuild(ctx, reviser, f.guild, a, "x", { continues: old });
    expect(again.ok && again.build.continuesId).toBe(v2.build.id);
  });

  it("continues a built plan by adding onto what it made", async () => {
    const f = fakeGuild("q15");
    const a = asker(f);
    const v1 = await planBuild(ctx, stub(sectionPlan), f.guild, a, "a WARDOGS section");
    if (!v1.ok) throw new Error(v1.error);
    const built = await applyBuild(ctx, f.guild, v1.build);
    if (!built.ok) throw new Error(built.error);
    // As the dashboard does: the build as stored, with what it created.
    const { getQmBuild } = await import("@garrison/db");
    const stored = await getQmBuild(ctx.db, "q15", v1.build.id);
    if (!stored) throw new Error("v1 missing");
    let told: PlannerInput["continuation"];
    const extender: Planner = {
      plan: async (input) => {
        told = input.continuation;
        return { ok: true, plan: rolesPlan(2), model: "stub", usage: TYPICAL };
      },
    };
    const v2 = await planBuild(ctx, extender, f.guild, a, "more", { continues: stored });
    expect(v2).toMatchObject({ ok: true, replaced: null });
    expect(told?.mode).toBe("extend");
    expect(told?.mode === "extend" && told.built.map((b) => b.name)).toEqual([
      "Gold+",
      "WARDOGS",
      "ranked-lfg",
      "Ranked voice",
    ]);
  });

  it("lets a Pro server past Free's limits, up to 10 requests an hour", async () => {
    const f = fakeGuild("q5");
    await upsertGuild(ctx.db, { id: "q5", name: "q5" });
    await ctx.db.insert(schema.guildPlans).values({ guildId: "q5", plan: "pro" });
    for (let i = 0; i < 10; i++)
      expect((await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x")).ok).toBe(true);
    const eleventh = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x");
    expect(!eleventh.ok && eleventh.error).toMatch(/lot of AI assistant use in one hour/);
  });

  it("charges a failed plan what it used, and caps attempts per hour", async () => {
    const f = fakeGuild("q6");
    const since = new Date();
    const failing: Planner = {
      plan: async () => ({
        ok: false,
        error: "declined",
        usage: { model: "claude-haiku-5-5", inputTokens: 3000, outputTokens: 500 },
      }),
    };
    for (let i = 0; i < 9; i++)
      expect(await planBuild(ctx, failing, f.guild, asker(f), "x")).toMatchObject({ ok: false });
    // Each failure cost $0.00055 of AI, so 1 supply: those tokens were paid for.
    expect(await suppliesUsed(ctx.db, { guildId: "q6" })).toBe(9);
    expect((await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x")).ok).toBe(true);
    expect(await suppliesUsed(ctx.db, { guildId: "q6" })).toBe(16);
    // But every attempt counts toward 10 an hour, and failures' cost is kept.
    const blocked = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x");
    expect(!blocked.ok && blocked.error).toMatch(/lot of AI assistant use in one hour/);
    const spend = await aiSpendSince(ctx.db, since);
    expect(spend.dollars).toBeCloseTo((9 * 550 + 2620) / 1e6, 6);
  });

  it("takes one item out of a waiting draft as its next version, with what depended on it", async () => {
    const { doQmRemove } = await import("../dashboard/more.js");
    const { getQmBuild } = await import("@garrison/db");
    const f = fakeGuild("q27");
    const a = asker(f);
    const v1 = await planBuild(ctx, stub(sectionPlan), f.guild, a, "a WARDOGS section");
    if (!v1.ok) throw new Error(v1.error);
    const me = { id: a.id } as unknown as GuildMember;
    // Someone else can't change it.
    const other = { id: "97999" } as unknown as GuildMember;
    expect(await doQmRemove(ctx, f.guild, other, { id: v1.build.id, ref: "gold" })).toMatchObject({
      ok: false,
    });
    const out = await doQmRemove(ctx, f.guild, me, { id: v1.build.id, ref: "gold" });
    expect(out).toMatchObject({ ok: true, message: expect.stringMatching(/Gold\+ and 1 more/) });
    expect((await getQmBuild(ctx.db, "q27", v1.build.id))?.status).toBe("cancelled");
    const { listQmBuilds } = await import("@garrison/db");
    const [v2] = await listQmBuilds(ctx.db, "q27", 1);
    expect(v2?.status).toBe("pending");
    expect(v2?.plan.map((o) => o.ref)).toEqual(["wardogs", "vc"]);
  });

  it("stops every server once the day's budget is spent", async () => {
    const f = fakeGuild("q7");
    // Below zero: already spent, whatever the paying servers add to it.
    const capped = { ...ctx, qmDailyBudgetUsd: -1 };
    const outcome = await planBuild(capped, stub(sectionPlan), f.guild, asker(f), "x");
    expect(!outcome.ok && outcome.error).toMatch(/limit for today across all servers/);
  });
});

describe("AI costs", () => {
  it("prices calls from the model's list price, and unknown models as the dearest", () => {
    // 3,400 in and 2,000 out on Haiku: $0.00034 + $0.001.
    expect(costMicros("claude-haiku-5-5", 3400, 2000)).toBe(1340);
    expect(costMicros("claude-opus-5-5", 1000, 1000)).toBe(24000);
    expect(costMicros("some-new-model", 1000, 1000)).toBe(24000);
    // A round at its worst: 40,000 tokens written to the cache, and 16,000 out.
    expect(qmReserveMicros("claude-haiku-5-5")).toBe(13_000);
    // Cache reads at a tenth, writes at a quarter more.
    expect(costMicros("claude-haiku-5-5", 1000, 0, { read: 10_000, write: 1000 })).toBe(325);
  });
});

describe("channel overwrites", () => {
  const P = PermissionFlagsBits;
  const ids = { everyone: "e", me: "me", resolve: (r: string) => `id:${r}` };
  const base = {
    ref: "x",
    name: "x",
    parent: null,
    topic: null,
    slowmodeSeconds: null,
    userLimit: null,
    privateTo: [] as string[],
    color: null,
    hoist: false,
    mentionable: false,
  };
  const of = (rows: ReturnType<typeof channelOverwrites>, id: string) =>
    rows.find((r) => r.id === id) as { allow: bigint[]; deny: bigint[] } | undefined;

  it("makes a public channel read-only, with posters, keeping Garrison able to post", () => {
    const rows = channelOverwrites(
      { ...base, kind: "create_text_channel", readOnly: true, posters: ["mods"] },
      ids,
      () => true,
    );
    expect(of(rows, "e")?.deny).toEqual([
      P.SendMessages,
      P.SendMessagesInThreads,
      P.CreatePublicThreads,
    ]);
    expect(of(rows, "id:mods")?.allow).toContain(P.SendMessages);
    expect(of(rows, "me")?.allow).toContain(P.SendMessages);
  });

  it("keeps a private listen-only voice room private, and sets only what Garrison holds", () => {
    const rows = channelOverwrites(
      {
        ...base,
        kind: "create_voice_channel",
        privateTo: ["raiders"],
        readOnly: true,
        posters: ["lead"],
      },
      ids,
      (bit) => bit !== P.Stream,
    );
    expect(of(rows, "e")?.deny).toEqual([P.ViewChannel]);
    expect(of(rows, "id:raiders")?.allow).toContain(P.Connect);
    expect(of(rows, "id:raiders")?.deny).toEqual([P.Speak]);
    expect(of(rows, "id:lead")?.allow).toContain(P.Speak);
    expect(rows.flatMap((r) => [...(r.allow as bigint[]), ...(r.deny as bigint[])])).not.toContain(
      P.Stream,
    );
  });
});

describe("AI assistant chat", () => {
  /** A chat model that answers each turn from a script, recording what it was told. */
  const scripted = (
    turns: {
      reply: string;
      choices?: string[];
      plan?: (AiPlan & { settings?: QmSettingProposal[]; posts?: QmPostProposal[] }) | null;
    }[],
    seen: ChatInput[] = [],
  ): Planner => {
    let i = 0;
    return {
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async (input) => {
        seen.push(input);
        const t = turns[Math.min(i++, turns.length - 1)];
        return {
          ok: true,
          reply: t?.reply ?? "",
          choices: t?.choices ?? [],
          plan: t?.plan ? { settings: [], posts: [], ...t.plan } : null,
          model: "stub",
          usage: TYPICAL,
        };
      },
    };
  };

  it("asks, then drafts a plan, then revises it in the same conversation", async () => {
    const f = fakeGuild("q16");
    const me = asker(f);
    const seen: ChatInput[] = [];
    const bot = scripted(
      [
        { reply: "Casual, ranked or both?", choices: ["Both", "Ranked"] },
        { reply: "Here's a section.", plan: sectionPlan },
        { reply: "Added two roles.", plan: rolesPlan(6) },
      ],
      seen,
    );
    const first = await chatTurn(ctx, bot, f.guild, me, { message: "We play Valorant" });
    expect(first).toMatchObject({ ok: true, build: null });
    if (!first.ok) return;
    const second = await chatTurn(ctx, bot, f.guild, me, {
      message: "Both",
      threadId: first.threadId,
    });
    expect(second).toMatchObject({ ok: true, threadId: first.threadId });
    if (!second.ok || !second.build) throw new Error("no plan drafted");
    expect(seen[1]?.history.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    const third = await chatTurn(ctx, bot, f.guild, me, {
      message: "Add roles",
      threadId: first.threadId,
    });
    if (!third.ok || !third.build) throw new Error("no revision");
    expect(third.build.continuesId).toBe(second.build.id);
    expect(seen[2]?.continuation?.mode).toBe("revise");
    const { listQmThread, getQmBuild } = await import("@garrison/db");
    const thread = await listQmThread(ctx.db, "q16", me.id, first.threadId);
    expect(thread.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(thread[1]?.choices).toEqual(["Both", "Ranked"]);
    expect(thread[3]?.buildId).toBe(second.build.id);
    expect((await getQmBuild(ctx.db, "q16", second.build.id))?.status).toBe("cancelled");
  });

  it("builds on the one draft from a new conversation, and drops only what it names", async () => {
    const f = fakeGuild("q16b");
    const me = asker(f);
    const bot = scripted([
      { reply: "Here's a section.", plan: sectionPlan },
      // A new conversation: the answer mentions only its new role, and drops the voice room.
      {
        reply: "Added a Coach role and took out the voice room.",
        plan: {
          summary: "Coach role",
          notes: "",
          operations: [op({ kind: "create_role", ref: "coach", name: "Coach" })],
          drop: ["vc"],
        },
      },
    ]);
    const first = await chatTurn(ctx, bot, f.guild, me, { message: "A WARDOGS section" });
    if (!first.ok || !first.build) throw new Error("no draft");
    const second = await chatTurn(ctx, bot, f.guild, me, { message: "Add a coach", fresh: true });
    if (!second.ok || !second.build) throw new Error("no revision");
    expect(second.threadId).not.toBe(first.threadId);
    expect(second.build.continuesId).toBe(first.build.id);
    expect(second.build.plan.map((o) => o.ref)).toEqual(["gold", "wardogs", "ranked", "coach"]);
  });

  it("keeps someone else's thread private: a stranger's thread id starts a new one", async () => {
    const f = fakeGuild("q17");
    const bot = scripted([{ reply: "Hi" }]);
    const mine = await chatTurn(ctx, bot, f.guild, asker(f), { message: "hello" });
    if (!mine.ok) throw new Error(mine.error);
    const theirs = await chatTurn(
      ctx,
      bot,
      f.guild,
      { id: "97000", tag: "other" },
      { message: "hello", threadId: mine.threadId },
    );
    expect(theirs.ok && theirs.threadId).not.toBe(mine.threadId);
  });

  it("explains an unsafe plan in the chat instead of storing it", async () => {
    const f = fakeGuild("q18");
    const bad: AiPlan = {
      summary: "x",
      notes: "",
      operations: [op({ kind: "create_role", ref: "Bad Ref!", name: "x" })],
    };
    const outcome = await chatTurn(
      ctx,
      scripted([{ reply: "Here.", plan: bad }]),
      f.guild,
      asker(f),
      {
        message: "go",
      },
    );
    expect(outcome).toMatchObject({ ok: true, build: null });
    expect(outcome.ok && outcome.reply).toMatch(/couldn't make that plan safely/);
  });

  it("fixes a refused draft once from Garrison's reasons, instead of showing a broken plan", async () => {
    const f = fakeGuild("q18b");
    const bad: AiPlan = {
      summary: "x",
      notes: "",
      operations: [op({ kind: "create_role", ref: "Bad Ref!", name: "Raiders" })],
    };
    const good: AiPlan = {
      summary: "Adds a Raiders role",
      notes: "",
      operations: [op({ kind: "create_role", ref: "raiders", name: "Raiders" })],
    };
    const seen: ChatInput[] = [];
    const outcome = await chatTurn(
      ctx,
      scripted(
        [
          { reply: "Here's a Raiders role.", plan: bad },
          { reply: "This plan adds a Raiders role.", plan: good },
        ],
        seen,
      ),
      f.guild,
      asker(f),
      { message: "add a raiders role" },
    );
    expect(outcome).toMatchObject({ ok: true, reply: "This plan adds a Raiders role." });
    expect(outcome.ok && outcome.build?.plan[0]?.ref).toBe("raiders");
    // The second call saw the checker's exact reason and its own draft.
    const repair = seen[1]?.history.at(-1)?.text ?? "";
    expect(repair).toMatch(/Garrison's checks refused that draft/);
    expect(repair).toMatch(/ref "Bad Ref!" isn't valid/);
    expect(seen[1]?.history.at(-2)?.text).toMatch(/<draft>/);
    // The message's hold is the budget, and the fix gets only what the first answer left.
    expect(seen[0]?.budgetMicros).toBe(39_000);
    const first = costMicros(TYPICAL.model, TYPICAL.inputTokens, TYPICAL.outputTokens);
    expect(seen[1]?.budgetMicros).toBe(39_000 - first);
  });

  it("charges a typical message 3 supplies, and says so in the chat when they run out", async () => {
    const f = fakeGuild("q19");
    const me = asker(f);
    await used(f, me, FREE - 40);
    const bot = scripted([{ reply: "Sure." }]);
    let thread: string | undefined;
    for (let i = 0; i < 13; i++) {
      const turn = await chatTurn(ctx, bot, f.guild, me, { message: "hi", threadId: thread });
      if (!turn.ok) throw new Error(`stopped at ${i}: ${turn.error}`);
      thread = turn.threadId;
    }
    expect(await suppliesUsed(ctx.db, { guildId: "q19" })).toBe(FREE - 1);
    const out = await chatTurn(ctx, bot, f.guild, me, { message: "hi", threadId: thread });
    expect(!out.ok && out.error).toMatch(
      /100 AI assistant supplies.*Plans you've drafted can still be built/,
    );
    const { listQmThread } = await import("@garrison/db");
    const log = await listQmThread(ctx.db, "q19", me.id, thread ?? "");
    expect(log.at(-1)?.text).toMatch(/Plans you've drafted can still be built/);
    // Each reply says what its message cost.
    expect(log.at(-3)?.supplies).toBe(3);
  });

  it("lets the chat read this server's settings, with names for channels and roles", async () => {
    const f = fakeGuild("q21");
    await upsertGuild(ctx.db, { id: "q21", name: "q21" });
    const ideas = "123456789012345021";
    f.channels.set(ideas, {
      id: ideas,
      name: "ideas",
      type: ChannelType.GuildText,
      isThread: () => false,
      delete: async () => {},
    });
    await ctx.db
      .insert(schema.suggestionSettings)
      .values({ guildId: "q21", enabled: true, channelId: ideas });
    const looked: Record<string, string> = {};
    const bot: Planner = {
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async (input) => {
        if (!input.read) throw new Error("no read tools");
        looked.overview = (await input.read("server_overview", {})).text;
        looked.module = (await input.read("module_settings", { module: "suggestions" })).text;
        looked.bad = JSON.stringify(await input.read("module_settings", { module: "antinuke" }));
        return {
          ok: true,
          reply: "Suggestions are on.",
          choices: [],
          plan: null,
          model: "stub",
          usage: TYPICAL,
        };
      },
    };
    expect((await chatTurn(ctx, bot, f.guild, asker(f), { message: "what's on?" })).ok).toBe(true);
    const overview = JSON.parse(looked.overview ?? "{}");
    expect(overview).toMatchObject({ plan: "free", supplies_left: FREE, supplies_in_pool: FREE });
    // With the panel's words beside them (0092).
    expect(overview.modules).toContainEqual(
      expect.objectContaining({
        module: "suggestions",
        page: "Suggestions",
        enabled: true,
        channelId: `#ideas (${ideas})`,
        anonymous: false,
      }),
    );
    expect(overview.modules).toContainEqual({
      module: "starboard",
      page: "Starboard",
      status: "not set up",
    });
    expect(JSON.parse(looked.module ?? "{}")).toEqual({
      module: "suggestions",
      page: "Suggestions",
      settings: {
        enabled: true,
        channelId: `#ideas (${ideas})`,
        anonymous: false,
        // The panel and its form, unset: the standard ones (0092).
        panelTitle: null,
        panelBody: null,
        buttonLabel: null,
        questions: null,
        panelSticky: true,
      },
    });
    // Anti-nuke isn't readable or editable here: it stays an owner-only command.
    expect(looked.bad).toMatch(/Unknown module/);
    expect(await suppliesUsed(ctx.db, { guildId: "q21" })).toBe(3);
  });

  it("drafts a channel and turns Suggestions on in it, builds both, and undoes both", async () => {
    const f = fakeGuild("q22");
    await upsertGuild(ctx.db, { id: "q22", name: "q22" });
    const me = asker(f);
    const plan = {
      summary: "Suggestions",
      notes: "",
      operations: [op({ kind: "create_text_channel", ref: "Ideas", name: "ideas" })],
      settings: [
        { module: "suggestions", field: "enabled", value: true },
        { module: "suggestions", field: "channelId", value: "ideas" },
      ],
    };
    const turn = await chatTurn(ctx, scripted([{ reply: "Here.", plan }]), f.guild, me, {
      message: "add suggestions",
    });
    if (!turn.ok || !turn.build) throw new Error(turn.ok ? "no plan" : turn.error);
    expect(turn.build.settings).toEqual([
      { module: "suggestions", field: "enabled", from: false, to: true },
      { module: "suggestions", field: "channelId", from: null, to: "ideas" },
    ]);
    // The message, the channel and two settings.
    expect(await suppliesUsed(ctx.db, { guildId: "q22" })).toBe(6);

    const built = await applyBuild(ctx, f.guild, turn.build);
    if (!built.ok) throw new Error(built.error);
    expect(built.failed).toBeNull();
    expect(built.created.map((c) => c.kind)).toEqual(["channel", "setting", "setting"]);
    expect(await readSettings(ctx.db, "q22", "suggestions")).toMatchObject({
      enabled: true,
      channelId: "q22-1",
      anonymous: false,
    });
    const [change] = await listSettingsChanges(ctx.db, "q22");
    expect(change?.username).toMatch(/AI assistant v1/);

    const { getQmBuild } = await import("@garrison/db");
    const stored = await getQmBuild(ctx.db, "q22", turn.build.id);
    if (!stored) throw new Error("missing");
    const undone = await undoBuild(ctx, f.guild, stored, me.id, "owner");
    expect(undone).toMatchObject({
      ok: true,
      removed: 1,
      settings: { undone: 1, changedSince: 0 },
    });
    expect(await readSettings(ctx.db, "q22", "suggestions")).toMatchObject({
      enabled: false,
      channelId: null,
    });
  });

  it("refuses a settings plan that uses a role with admin powers, and gives the message back", async () => {
    const f = fakeGuild("q23");
    const admin = "123456789012345023";
    f.roles.set(admin, {
      id: admin,
      name: "Admins",
      managed: false,
      position: 5,
      delete: async () => {},
      permissions: new PermissionsBitField(PermissionFlagsBits.Administrator),
    });
    const plan = {
      summary: "x",
      notes: "",
      operations: [],
      settings: [{ module: "automod", field: "exemptRoleIds", value: [admin] }],
    };
    const turn = await chatTurn(ctx, scripted([{ reply: "Done.", plan }]), f.guild, asker(f), {
      message: "exempt admins",
    });
    expect(turn).toMatchObject({ ok: true, build: null });
    expect(turn.ok && turn.reply).toMatch(/@Admins has moderation or admin powers/);
    // The AI it used is charged (6 here); its refused changes cost nothing.
    expect(await suppliesUsed(ctx.db, { guildId: "q23" })).toBe(6);
  });

  it("leaves a setting alone on undo when someone changed it since", async () => {
    const f = fakeGuild("q24");
    await upsertGuild(ctx.db, { id: "q24", name: "q24" });
    const me = asker(f);
    const plan = {
      summary: "Leveling",
      notes: "",
      operations: [],
      settings: [{ module: "ranks", field: "enabled", value: true }],
    };
    const turn = await chatTurn(ctx, scripted([{ reply: "On.", plan }]), f.guild, me, {
      message: "turn on leveling",
    });
    if (!turn.ok || !turn.build) throw new Error("no plan");
    const built = await applyBuild(ctx, f.guild, turn.build);
    expect(built.ok && built.failed).toBeNull();
    await applySettingsChange(ctx.db, {
      guildId: "q24",
      module: "ranks",
      patch: { enabled: false },
      userId: "2",
      username: "someone",
    });
    const { getQmBuild } = await import("@garrison/db");
    const stored = await getQmBuild(ctx.db, "q24", turn.build.id);
    if (!stored) throw new Error("missing");
    expect(await undoBuild(ctx, f.guild, stored, me.id)).toMatchObject({
      ok: true,
      settings: { undone: 0, changedSince: 1 },
    });
  });

  it("posts a saved message into a channel the same plan makes, and Undo leaves the post", async () => {
    const f = fakeGuild("q25");
    await upsertGuild(ctx.db, { id: "q25", name: "q25" });
    await ctx.db.insert(schema.messageSettings).values({
      guildId: "q25",
      messages: [
        {
          id: "rules01",
          name: "Rules",
          card: blankCard("Rules"),
          buttons: [],
          channelId: null,
          schedule: null,
        },
      ],
    });
    const me = asker(f);
    const plan = {
      summary: "Rules",
      notes: "",
      operations: [op({ kind: "create_text_channel", ref: "rules", name: "rules" })],
      posts: [{ kind: "message", itemId: "rules01", channel: "rules" }],
    };
    const turn = await chatTurn(ctx, scripted([{ reply: "Here.", plan }]), f.guild, me, {
      message: "post the rules",
    });
    if (!turn.ok || !turn.build) throw new Error(turn.ok ? "no plan" : turn.error);
    expect(turn.build.posts).toEqual([
      { kind: "message", itemId: "rules01", name: "Rules", channel: "rules" },
    ]);
    // The message, the channel and the post.
    expect(await suppliesUsed(ctx.db, { guildId: "q25" })).toBe(5);

    Object.assign(f.guild.members, { fetch: async (id: string) => ({ id }) });
    const built = await applyBuild(ctx, f.guild, turn.build);
    if (!built.ok) throw new Error(built.error);
    expect(built.failed).toBeNull();
    expect(posted).toEqual([{ member: me.id, raw: { messageId: "rules01", channelId: "q25-1" } }]);
    expect(built.created.map((c) => c.kind)).toEqual(["channel", "post"]);

    const { getQmBuild } = await import("@garrison/db");
    const stored = await getQmBuild(ctx.db, "q25", turn.build.id);
    if (!stored) throw new Error("missing");
    const undone = await undoBuild(ctx, f.guild, stored, me.id);
    expect(undone).toMatchObject({ ok: true, removed: 1, posts: 1 });
    expect(undoSettingsNote({ undone: 0, changedSince: 0 }, 1)).toMatch(/Its post stays/);
  });

  it("refuses to post something the server hasn't saved", async () => {
    const f = fakeGuild("q26");
    const plan = {
      summary: "x",
      notes: "",
      operations: [],
      posts: [{ kind: "role_menu", itemId: "nope01", channel: "123456789012345026" }],
    };
    const turn = await chatTurn(ctx, scripted([{ reply: "Done.", plan }]), f.guild, asker(f), {
      message: "post the menu",
    });
    expect(turn).toMatchObject({ ok: true, build: null });
    expect(turn.ok && turn.reply).toMatch(/isn't saved on this server/);
    expect(await suppliesUsed(ctx.db, { guildId: "q26" })).toBe(6);
  });

  it("charges a message whose plan couldn't be made safely its AI, and nothing for changes", async () => {
    const f = fakeGuild("q20");
    const bad: AiPlan = {
      summary: "x",
      notes: "",
      operations: [op({ kind: "create_role", ref: "Bad Ref!", name: "x" })],
    };
    await chatTurn(ctx, scripted([{ reply: "Here.", plan: bad }]), f.guild, asker(f), {
      message: "go",
    });
    // Until 2026-11-20 this was free, which let a pool spend AI it never counted.
    expect(await suppliesUsed(ctx.db, { guildId: "q20" })).toBe(6);
  });
});

describe("hand changes from the Your server panel", () => {
  it("saves each one into the person's draft as the next version, free of supplies", async () => {
    const { doQmEdit } = await import("../dashboard/more.js");
    const { aiAllowance, getQmBuild, latestWaitingQmBuild } = await import("@garrison/db");
    const f = fakeGuild("q41");
    const add = (cid: string, name: string, type: ChannelType, parentId: string | null) =>
      f.channels.set(cid, {
        id: cid,
        name,
        type,
        isThread: () => false,
        rawPosition: 0,
        parentId,
        delete: async () => {},
      });
    add("123456789012345201", "Info", ChannelType.GuildCategory, null);
    add("123456789012345202", "Games", ChannelType.GuildCategory, null);
    add("123456789012345203", "general", ChannelType.GuildText, "123456789012345201");
    const a = asker(f);
    const me = { id: a.id, user: { username: a.tag } } as unknown as GuildMember;
    const before = (await aiAllowance(ctx.db, "q41", a.id)).suppliesLeft;

    // No draft yet: a rename starts one.
    const renamed = await doQmEdit(ctx, f.guild, me, {
      change: "rename",
      target: "123456789012345203",
      name: "The Lounge",
    });
    expect(renamed).toMatchObject({ ok: true });
    const v1 = await latestWaitingQmBuild(ctx.db, "q41", a.id);
    expect(v1?.model).toBe("hand");
    expect(v1?.edits).toEqual([
      {
        kind: "edit_channel",
        id: "123456789012345203",
        was: "general",
        by: "admin",
        name: "the-lounge",
      },
    ]);

    // The next one goes onto the newest version, and retires the one before it.
    expect(
      await doQmEdit(ctx, f.guild, me, {
        change: "move",
        target: "123456789012345203",
        parent: "123456789012345202",
      }),
    ).toMatchObject({ ok: true });
    const v2 = await latestWaitingQmBuild(ctx.db, "q41", a.id);
    expect(v2?.version).toBe((v1?.version ?? 0) + 1);
    expect(v2?.edits[0]).toMatchObject({ name: "the-lounge", parent: "123456789012345202" });
    expect((await getQmBuild(ctx.db, "q41", v1?.id ?? ""))?.status).toBe("cancelled");

    // Hand changes hold no supplies while they wait.
    expect((await aiAllowance(ctx.db, "q41", a.id)).suppliesLeft).toBe(before);

    // Someone else's draft isn't theirs to change.
    const other = { id: "98888", user: { username: "x" } } as unknown as GuildMember;
    expect(
      await doQmEdit(ctx, f.guild, other, {
        id: v2?.id,
        change: "rename",
        target: "123456789012345201",
        name: "Start",
      }),
    ).toMatchObject({ ok: false });
  });

  it("keeps a removed edit's neighbours when an item is taken out of a draft", async () => {
    const { doQmEdit, doQmRemove } = await import("../dashboard/more.js");
    const { latestWaitingQmBuild } = await import("@garrison/db");
    const f = fakeGuild("q42");
    for (const [cid, name] of [
      ["123456789012345301", "Info"],
      ["123456789012345302", "Games"],
    ] as const)
      f.channels.set(cid, {
        id: cid,
        name,
        type: ChannelType.GuildCategory,
        isThread: () => false,
        rawPosition: 0,
        parentId: null,
        delete: async () => {},
      });
    const a = asker(f);
    const me = { id: a.id, user: { username: a.tag } } as unknown as GuildMember;
    await doQmEdit(ctx, f.guild, me, {
      change: "rename",
      target: "123456789012345301",
      name: "Start",
    });
    await doQmEdit(ctx, f.guild, me, {
      change: "rename",
      target: "123456789012345302",
      name: "Play",
    });
    const draft = await latestWaitingQmBuild(ctx.db, "q42", a.id);
    expect(draft?.edits).toHaveLength(2);
    // Taking one edit out leaves the other: edits used to be lost here.
    await doQmRemove(ctx, f.guild, me, { id: draft?.id, edit: "123456789012345301" });
    const next = await latestWaitingQmBuild(ctx.db, "q42", a.id);
    expect(next?.edits.map((e) => e.name)).toEqual(["Play"]);
  });
});

describe("Fast or Smart in the AI assistant", () => {
  /** A chat model that says which one it is, and reports a look as it goes. */
  const named = (model: string): Planner => ({
    model,
    plan: async () => ({ ok: false, error: "not used" }),
    chat: async (input) => {
      input.onStep?.("Looking at your Moderation settings");
      return {
        ok: true,
        reply: `Hi from ${model}.`,
        choices: [],
        plan: null,
        model,
        usage: { model, inputTokens: 1000, outputTokens: 200 },
      };
    },
  });
  const both = () => ({
    ...ctx,
    planner: named("claude-haiku-5-5"),
    smartPlanner: named("claude-sonnet-5-5"),
  });

  it("keeps Smart for Pro, and Fast for every plan", async () => {
    const { doQmChat } = await import("../dashboard/more.js");
    const f = fakeGuild("q51");
    const a = asker(f);
    const me = { id: a.id, user: { username: a.tag } } as unknown as GuildMember;
    expect(await doQmChat(both(), f.guild, me, { message: "hi", model: "smart" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Smart is part of Garrison Pro/),
    });
    expect(await doQmChat(both(), f.guild, me, { message: "hi" })).toMatchObject({ ok: true });
  });

  it("runs Smart on Pro, keeps the model on the reply, and says what it's doing", async () => {
    const { doQmChat } = await import("../dashboard/more.js");
    const { latestQmThread, listQmThread, queueDashboardAction, claimDashboardActions } =
      await import("@garrison/db");
    const f = fakeGuild("q52");
    await upsertGuild(ctx.db, { id: "q52", name: "q52" });
    await ctx.db.insert(schema.guildPlans).values({ guildId: "q52", plan: "pro" });
    const a = asker(f);
    const me = { id: a.id, user: { username: a.tag } } as unknown as GuildMember;
    // A real request, running, so the step lands on it.
    const queued = await queueDashboardAction(
      ctx.db,
      "q52",
      { id: a.id, name: a.tag },
      { kind: "qm_chat", payload: { message: "hi", model: "smart" } },
    );
    if (!queued.ok) throw new Error(queued.reason);
    await claimDashboardActions(ctx.db, 10);
    const out = await doQmChat(
      both(),
      f.guild,
      me,
      { message: "hi", model: "smart" },
      queued.action.id,
    );
    expect(out).toMatchObject({ ok: true });
    const thread = await latestQmThread(ctx.db, "q52", a.id);
    const reply = (await listQmThread(ctx.db, "q52", a.id, thread ?? "")).at(-1);
    expect(reply).toMatchObject({ text: "Hi from claude-sonnet-5-5.", model: "claude-sonnet-5-5" });
    const { listDashboardActions } = await import("@garrison/db");
    const row = (await listDashboardActions(ctx.db, "q52", 5)).find(
      (x) => x.id === queued.action.id,
    );
    expect(row?.message).toBe("Looking at your Moderation settings…");
  });

  it("lists a person's conversations, newest first, with their first message", async () => {
    const { listQmThreads } = await import("@garrison/db");
    const f = fakeGuild("q53");
    const a = asker(f);
    const bot = named("claude-haiku-5-5");
    const first = await chatTurn(ctx, bot, f.guild, a, { message: "Make a Valorant section" });
    const second = await chatTurn(ctx, bot, f.guild, a, { message: "Tidy my roles", fresh: true });
    if (!first.ok || !second.ok) throw new Error("chat failed");
    const threads = await listQmThreads(ctx.db, "q53", a.id);
    expect(threads.map((t) => t.first)).toEqual(["Tidy my roles", "Make a Valorant section"]);
    expect(threads[0]?.threadId).toBe(second.threadId);
  });
});

describe("rating the assistant's replies", () => {
  it("keeps a person's thumbs on their own replies, and lists the downs for review", async () => {
    const { rateQmReply, listDownRatedReplies, latestQmThread, listQmThread } = await import(
      "@garrison/db"
    );
    const f = fakeGuild("q61");
    const a = asker(f);
    const bot: Planner = {
      model: "claude-haiku-5-5",
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async () => ({
        ok: true,
        reply: "Your Moderation page has that.",
        choices: [],
        plan: null,
        model: "claude-haiku-5-5",
      }),
    };
    await chatTurn(ctx, bot, f.guild, a, { message: "Where are warnings set?" });
    const thread = await latestQmThread(ctx.db, "q61", a.id);
    const reply = (await listQmThread(ctx.db, "q61", a.id, thread ?? "")).at(-1);
    const rate = (authorId: string, feedback: 1 | -1 | null, note?: string) =>
      rateQmReply(ctx.db, { guildId: "q61", authorId, messageId: reply?.id ?? "", feedback, note });
    // Someone else can't rate it.
    expect(await rate("someone-else", 1)).toBe(false);
    expect(await rate(a.id, -1, "It's on the Moderation page, warnings tab")).toBe(true);
    const downs = await listDownRatedReplies(ctx.db, new Date(Date.now() - 60_000));
    expect(downs.find((d) => d.id === reply?.id)).toMatchObject({
      ask: "Where are warnings set?",
      reply: "Your Moderation page has that.",
      note: "It's on the Moderation page, warnings tab",
    });
    // Taken back, it leaves the list.
    expect(await rate(a.id, null)).toBe(true);
    const after = await listDownRatedReplies(ctx.db, new Date(Date.now() - 60_000));
    expect(after.some((d) => d.id === reply?.id)).toBe(false);
  });
});

describe("how the server is doing, for the AI assistant", () => {
  it("reads cases as counts, the health check, the leaderboard and what's coming up", async () => {
    const { createCase, saveHealthSnapshot, awardXp, aiAllowance } = await import("@garrison/db");
    const { settingsReader } = await import("./tools.js");
    const f = fakeGuild("q71");
    await upsertGuild(ctx.db, { id: "q71", name: "q71" });
    const mod = { moderatorId: "m1", moderatorTag: "mod" };
    for (const action of ["warn", "warn", "ban"] as const)
      await createCase(ctx.db, {
        guildId: "q71",
        action,
        targetId: "victim-1",
        targetTag: "Victim",
        reason: "x",
        ...mod,
      });
    await saveHealthSnapshot(ctx.db, "q71", [
      { status: "ok", text: "Garrison can post in the log channel." },
      { status: "warn", text: "Mods sits above Garrison's role." },
    ]);
    await awardXp(ctx.db, "q71", { id: "u1", username: "Nyx" }, 50, 0);
    const read = settingsReader(ctx.db, f.guild, await aiAllowance(ctx.db, "q71", "someone"));
    const ask = async (topic: string) => (await read("server_insight", { topic })).text;

    const moderation = await ask("moderation");
    expect(moderation).toContain('"ban":1');
    expect(moderation).toContain('"warn":2');
    // Counts only: never who a case was against.
    expect(moderation).not.toContain("Victim");
    expect(moderation).not.toContain("victim-1");

    expect(await ask("health")).toContain("Mods sits above Garrison's role.");
    expect(await ask("health")).not.toContain("log channel");
    expect(await ask("leveling")).toContain('"name":"Nyx"');
    expect(await ask("upcoming")).toContain('"open_groups":0');
    // Free keeps 30 days; a year's activity is Pro's.
    expect(await ask("activity_year")).toContain('"days":30');
    expect((await read("server_insight", { topic: "everything" })).error).toBe(true);
  });
});

describe("text the AI assistant writes", () => {
  it("drafts a welcome card and a rules message in full, applies them, and Undo puts both back", async () => {
    const { readSettings, readMessages, readWelcome, getQmBuild } = await import("@garrison/db");
    const f = fakeGuild("q81");
    const a = asker(f);
    const bot: Planner = {
      model: "claude-haiku-5-5",
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async () => ({
        ok: true,
        reply: "This plan rewrites the welcome card and adds a rules message.",
        choices: [],
        model: "claude-haiku-5-5",
        usage: TYPICAL,
        plan: {
          summary: "Welcome and rules",
          notes: "",
          operations: [],
          settings: [],
          posts: [],
          writes: [
            {
              target: "welcome_join",
              title: "Welcome to {server}!",
              body: "Hey {user}, glad you're here.\n\nGrab your roles in #roles.",
            },
            {
              target: "new_message",
              messageId: "rules",
              name: "Server rules",
              title: "Rules",
              body: "1. Be kind.\n2. No spam.\n\nMods have the last word.",
            },
          ],
        },
      }),
    };
    const out = await chatTurn(ctx, bot, f.guild, a, {
      message: "Write our welcome and some rules",
    });
    if (!out.ok || !out.build) throw new Error(out.ok ? "no draft" : out.error);
    const draft = out.build;
    expect(draft.writes.map((w) => w.name)).toEqual(["The welcome card", "Server rules"]);
    expect(draft.writes[1]?.card.blocks.map((b) => (b.kind === "text" ? b.text : ""))).toEqual([
      "1. Be kind.\n2. No spam.",
      "Mods have the last word.",
    ]);
    // What the welcome card says now is kept, for the preview and for Undo.
    expect(draft.writes[0]?.was?.title).toBe(readWelcome(null).joinCard.title);

    const applied = await applyBuild(ctx, f.guild, draft);
    expect(applied).toMatchObject({ ok: true, failed: null });
    const messages = readMessages((await readSettings(ctx.db, "q81", "messages"))?.messages ?? []);
    expect(messages.map((m) => m.name)).toEqual(["Server rules"]);
    expect(readWelcome(await readSettings(ctx.db, "q81", "welcome")).joinCard.title).toBe(
      "Welcome to {server}!",
    );

    const built = await getQmBuild(ctx.db, "q81", draft.id);
    if (!built) throw new Error("gone");
    await undoBuild(ctx, f.guild, built, a.id);
    expect(readMessages((await readSettings(ctx.db, "q81", "messages"))?.messages ?? [])).toEqual(
      [],
    );
    expect(readWelcome(await readSettings(ctx.db, "q81", "welcome")).joinCard.title).toBe(
      readWelcome(null).joinCard.title,
    );
  });

  it("refuses a write the dashboard would refuse", async () => {
    const f = fakeGuild("q82");
    const a = asker(f);
    const long = "x".repeat(2000);
    const bot: Planner = {
      model: "claude-haiku-5-5",
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async () => ({
        ok: true,
        reply: "This plan writes the rules.",
        choices: [],
        model: "claude-haiku-5-5",
        usage: TYPICAL,
        plan: {
          summary: "x",
          notes: "",
          operations: [],
          settings: [],
          posts: [],
          writes: [{ target: "new_message", name: "Rules", title: "Rules", body: long }],
        },
      }),
    };
    const out = await chatTurn(ctx, bot, f.guild, a, { message: "rules" });
    expect(out.ok && out.build).toBeFalsy();
  });
});

describe("role menus and ticket panels the AI assistant makes", () => {
  const menuBot = (
    writes: NonNullable<ChatInput["history"]> extends unknown ? unknown[] : never,
    posts: unknown[] = [],
  ): Planner => ({
    model: "claude-haiku-5-5",
    plan: async () => ({ ok: false, error: "not used" }),
    chat: async () => ({
      ok: true,
      reply: "This plan adds a game roles menu and a support panel.",
      choices: [],
      model: "claude-haiku-5-5",
      usage: TYPICAL,
      plan: {
        summary: "Menus",
        notes: "",
        operations: [op({ kind: "create_role", ref: "apex", name: "Apex" })],
        settings: [],
        posts: posts as never,
        writes: writes as never,
      },
    }),
  });

  it("drafts both in full, applies them with the real role ids, and Undo takes them out", async () => {
    const { readSettings, readRoleMenus, readTicketPanels, getQmBuild } = await import(
      "@garrison/db"
    );
    const f = fakeGuild("q91");
    const role = (rid: string, name: string, bits = 0n) =>
      f.roles.set(rid, {
        id: rid,
        name,
        managed: false,
        position: 2,
        permissions: new PermissionsBitField(bits),
        delete: async () => {},
      });
    role("123456789012345401", "Valorant");
    role("123456789012345402", "Mods", PermissionFlagsBits.KickMembers);
    // Discord gives new roles snowflake ids, which a role menu requires.
    Object.assign(f.guild.roles, {
      create: async (o: { name: string }) => {
        role("123456789012345499", o.name);
        return { id: "123456789012345499", name: o.name };
      },
    });
    f.channels.set("123456789012345403", {
      id: "123456789012345403",
      name: "roles",
      type: ChannelType.GuildText,
      isThread: () => false,
      rawPosition: 0,
      parentId: null,
      delete: async () => {},
    });
    const a = asker(f);
    const writes = [
      {
        target: "new_role_menu",
        messageId: "games",
        name: "Game roles",
        title: "Pick your games",
        body: "Tap a game to get its role.",
        style: "buttons",
        items: [
          { role: "123456789012345401", label: "Valorant", emoji: "🔫" },
          { role: "apex", label: "Apex", emoji: "🎯" },
        ],
      },
      {
        target: "new_ticket_panel",
        messageId: "support",
        name: "Support",
        title: "Need help?",
        body: "Open a ticket and the Mods will answer.",
        items: [{ role: "", label: "Report someone", emoji: "🚩" }],
        // Ticket staff may have moderation powers: they only see tickets.
        staffRoles: ["123456789012345402"],
      },
    ];
    const out = await chatTurn(
      ctx,
      menuBot(writes, [{ kind: "role_menu", itemId: "games", channel: "123456789012345403" }]),
      f.guild,
      a,
      {
        message: "Game roles menu in #roles, and a support panel",
      },
    );
    if (!out.ok || !out.build) throw new Error(out.ok ? "no draft" : out.error);
    const draft = out.build;
    expect(draft.writes.map((w) => w.kind)).toEqual(["role_menu", "ticket_panel"]);
    // The post names the new menu by its id, made when drafted.
    expect(draft.posts[0]?.itemId).toBe(draft.writes[0]?.menu?.id);
    expect(draft.writes[0]?.menu?.options.map((o) => o.roleId)).toEqual([
      "123456789012345401",
      "apex",
    ]);

    // Applied without its post (posting needs Discord), the role ref becomes the new role's id.
    const applied = await applyBuild(ctx, f.guild, { ...draft, posts: [] });
    expect(applied).toMatchObject({ ok: true, failed: null });
    const menus = readRoleMenus((await readSettings(ctx.db, "q91", "roles"))?.menus ?? []);
    expect(menus).toHaveLength(1);
    expect(menus[0]?.options.map((o) => o.roleId)).toEqual([
      "123456789012345401",
      "123456789012345499",
    ]);
    const tickets = await readSettings(ctx.db, "q91", "tickets");
    expect(readTicketPanels(tickets?.panels ?? []).map((p) => p.name)).toEqual(["Support"]);
    expect(tickets?.staffRoleIds).toEqual(["123456789012345402"]);

    const built = await getQmBuild(ctx.db, "q91", draft.id);
    if (!built) throw new Error("gone");
    await undoBuild(ctx, f.guild, built, a.id);
    expect(readRoleMenus((await readSettings(ctx.db, "q91", "roles"))?.menus ?? [])).toEqual([]);
    expect(readTicketPanels((await readSettings(ctx.db, "q91", "tickets"))?.panels ?? [])).toEqual(
      [],
    );
  });

  it("won't put a role with moderation powers in a role menu", async () => {
    const f = fakeGuild("q92");
    f.roles.set("123456789012345501", {
      id: "123456789012345501",
      name: "Mods",
      managed: false,
      position: 2,
      permissions: new PermissionsBitField(PermissionFlagsBits.BanMembers),
      delete: async () => {},
    });
    const out = await chatTurn(
      ctx,
      menuBot([
        {
          target: "new_role_menu",
          name: "Bad",
          title: "Get Mods",
          body: "x",
          style: "buttons",
          items: [{ role: "123456789012345501", label: "Mods", emoji: "" }],
        },
      ]),
      f.guild,
      asker(f),
      { message: "menu" },
    );
    expect(out.ok && out.build).toBeFalsy();
    expect(out.ok && out.reply).toMatch(/moderation or admin powers/);
  });
});

describe("alerts, counters and giveaways the AI assistant sets up", () => {
  const bot = (settings: unknown[], writes: unknown[] = []): Planner => ({
    model: "claude-haiku-5-5",
    plan: async () => ({ ok: false, error: "not used" }),
    chat: async () => ({
      ok: true,
      reply: "This plan adds an alert, a counter and a giveaway.",
      choices: [],
      model: "claude-haiku-5-5",
      usage: TYPICAL,
      plan: {
        summary: "Extras",
        notes: "",
        operations: [op({ kind: "create_text_channel", ref: "streams", name: "streams" })],
        settings: settings as never,
        posts: [],
        writes: writes as never,
      },
    }),
  });

  it("adds to the saved lists when applied, and Undo puts them back", async () => {
    const { applySettingsChange, readSettings, getQmBuild } = await import("@garrison/db");
    const f = fakeGuild("q95");
    // Discord gives new channels snowflake ids, which an alert requires.
    Object.assign(f.guild.channels, {
      create: async (o: { name: string }) => {
        const c = {
          id: "123456789012345699",
          name: o.name,
          type: ChannelType.GuildText,
          isThread: () => false,
          rawPosition: 0,
          parentId: null,
          delete: async () => {},
        };
        f.channels.set(c.id, c);
        return c;
      },
    });
    f.channels.set("123456789012345601", {
      id: "123456789012345601",
      name: "general",
      type: ChannelType.GuildText,
      isThread: () => false,
      rawPosition: 0,
      parentId: null,
      delete: async () => {},
    });
    const a = asker(f);
    await upsertGuild(ctx.db, { id: "q95", name: "q95" });
    const saved = {
      id: "feed000001",
      provider: "youtube",
      handle: "@garrison",
      channelId: "123456789012345601",
      roleId: null,
      message: null,
      accent: null,
    };
    await applySettingsChange(ctx.db, {
      guildId: "q95",
      module: "alerts",
      patch: { feeds: [saved] },
      userId: a.id,
      username: "owner",
    });
    const out = await chatTurn(
      ctx,
      bot(
        [
          {
            module: "alerts",
            field: "feeds",
            value: [{ provider: "twitch", handle: "shroud", channelId: "streams", roleId: null }],
          },
          { module: "stats", field: "enabled", value: true },
          {
            module: "stats",
            field: "counters",
            value: [{ kind: "humans", roleId: null, template: "" }],
          },
        ],
        [
          {
            target: "new_giveaway",
            messageId: "",
            name: "",
            title: "Nitro for a month",
            body: "Enter before Friday.",
            items: [],
            staffRoles: [],
            channel: "streams",
            winners: 2,
            durationMinutes: 4320,
          },
        ],
      ),
      f.guild,
      a,
      {
        message:
          "Twitch alerts for shroud in a new #streams, a people counter, and a Nitro giveaway",
      },
    );
    if (!out.ok || !out.build) throw new Error(out.ok ? "no draft" : out.error);
    const draft = out.build;
    // Only what's new is in the draft.
    expect(draft.settings.find((c) => c.field === "feeds")).toMatchObject({
      from: null,
      to: [{ handle: "shroud", channelId: "streams" }],
    });
    expect(draft.writes[0]).toMatchObject({
      kind: "giveaway",
      giveaway: {
        channel: "streams",
        prize: "Nitro for a month",
        winners: 2,
        durationMinutes: 4320,
      },
    });

    // Applied without the giveaway (starting one needs Discord), the saved alert stays.
    const applied = await applyBuild(ctx, f.guild, { ...draft, writes: [] });
    expect(applied).toMatchObject({ ok: true, failed: null });
    const feeds = (await readSettings(ctx.db, "q95", "alerts"))?.feeds as {
      handle: string;
      channelId: string;
    }[];
    expect(feeds.map((x) => [x.handle, x.channelId])).toEqual([
      ["@garrison", "123456789012345601"],
      ["shroud", "123456789012345699"],
    ]);
    expect(await readSettings(ctx.db, "q95", "stats")).toMatchObject({
      enabled: true,
      counters: [{ kind: "humans", template: "People: {count}" }],
    });
    const built = await getQmBuild(ctx.db, "q95", draft.id);
    if (!built) throw new Error("gone");
    await undoBuild(ctx, f.guild, built, a.id);
    expect((await readSettings(ctx.db, "q95", "alerts"))?.feeds).toEqual([saved]);
  });

  it("won't start more giveaways than the plan runs at once", async () => {
    const f = fakeGuild("q96");
    f.channels.set("123456789012345701", {
      id: "123456789012345701",
      name: "giveaways",
      type: ChannelType.GuildText,
      isThread: () => false,
      rawPosition: 0,
      parentId: null,
      delete: async () => {},
    });
    const g = (title: string) => ({
      target: "new_giveaway",
      messageId: "",
      name: "",
      title,
      body: "",
      items: [],
      staffRoles: [],
      channel: "123456789012345701",
      winners: 1,
      durationMinutes: 60,
    });
    const out = await chatTurn(ctx, bot([], [g("One"), g("Two"), g("Three")]), f.guild, asker(f), {
      message: "Three giveaways",
    });
    expect(JSON.stringify(out)).toMatch(/can run 2 giveaways at once/);
  });
});

describe("a plan in the wrong shape", () => {
  it("goes back to the model once with what's wrong, and the fixed plan is drafted", async () => {
    const f = fakeGuild("q97");
    const asked: string[] = [];
    let calls = 0;
    const bot: Planner = {
      model: "claude-haiku-5-5",
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async (input) => {
        calls++;
        asked.push(input.history.at(-1)?.text ?? "");
        if (calls === 1)
          return {
            ok: true,
            reply: "Here's a lounge.",
            choices: [],
            model: "claude-haiku-5-5",
            usage: TYPICAL,
            plan: null,
            planProblem: {
              error: "plan_json doesn't match the plan format: operations.0.kind: Invalid option.",
              json: '{"operations":[{"kind":"create_lounge"}]}',
            },
          };
        return {
          ok: true,
          reply: "Here's a lounge channel.",
          choices: [],
          model: "claude-haiku-5-5",
          usage: TYPICAL,
          plan: {
            summary: "A lounge",
            notes: "",
            operations: [op({ kind: "create_text_channel", ref: "lounge", name: "lounge" })],
            settings: [],
            posts: [],
          },
        };
      },
    };
    const out = await chatTurn(ctx, bot, f.guild, asker(f), { message: "Add a lounge" });
    expect(calls).toBe(2);
    expect(asked[1]).toMatch(/operations\.0\.kind: Invalid option/);
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(out.build?.plan.map((o) => o.name)).toEqual(["lounge"]);
  });
});
