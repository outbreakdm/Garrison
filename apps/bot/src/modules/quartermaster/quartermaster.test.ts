import {
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
    await used(f, a, 160);
    const first = await planBuild(ctx, stub(rolesPlan(10)), f.guild, a, "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 27 });
    const small = await planBuild(ctx, stub(rolesPlan(3)), f.guild, a, "x");
    expect(small).toMatchObject({ ok: true, suppliesLeft: 21 });
    // 21 left: the message takes 3, so the next plan may make up to 18. One asking for more
    // is refused whole, and the refusal gives its message back.
    const tooBig = await planBuild(ctx, stub(rolesPlan(19)), f.guild, a, "x");
    expect(!tooBig.ok && tooBig.error).toMatch(/only 18 supplies are left for changes./);
    expect(await planBuild(ctx, stub(rolesPlan(18)), f.guild, a, "x")).toMatchObject({
      ok: true,
      suppliesLeft: 0,
    });
    const none = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
    expect(!none.ok && none.error).toMatch(
      /this month's 200 AI assistant supplies on Free servers\. They renew <t:\d+:R>.*Garrison Pro gives a server 3,000 supplies a month/,
    );
  });

  it("gives the planner what's left after the message as its limit", async () => {
    const f = fakeGuild("q12");
    const a = asker(f);
    await used(f, a, 160);
    expect((await planBuild(ctx, stub(rolesPlan(20)), f.guild, a, "x")).ok).toBe(true);
    expect((await planBuild(ctx, stub(rolesPlan(9)), f.guild, a, "x")).ok).toBe(true);
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
    await used(one, owner, 160);
    expect((await planBuild(ctx, stub(rolesPlan(20)), one.guild, owner, "x")).ok).toBe(true);
    const second = await planBuild(ctx, stub(rolesPlan(14)), two.guild, owner, "x");
    expect(second).toMatchObject({ ok: true, suppliesLeft: 0 });
    const third = await planBuild(ctx, stub(sectionPlan), three.guild, owner, "x");
    expect(!third.ok && third.error).toMatch(/this month's 200 AI assistant supplies on Free/);
    // Someone else can still use the third server's own supplies.
    const other = { id: "98001", tag: "other" };
    expect((await planBuild(ctx, stub(sectionPlan), three.guild, other, "x")).ok).toBe(true);
  });

  it("charges for every message, so many tiny plans can't run up the AI bill", async () => {
    const f = fakeGuild("q14");
    const a = asker(f);
    await used(f, a, 160);
    for (let i = 0; i < 10; i++)
      expect((await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x")).ok).toBe(true);
    const eleventh = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
    expect(!eleventh.ok && eleventh.error).toMatch(/this month's 200 AI assistant supplies/);
  });

  it("gives an Agency plan one pool of 13,000 a month, shared by its servers", async () => {
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
      pool: 13_000,
      suppliesLeft: 13_000,
      poolLeft: 13_000,
      packLeft: 0,
      perPerson: false,
      shared: true,
      resetsAt: expect.any(Date),
    });
    const first = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 12_993 });
  });

  it("revises a waiting plan into the next version, which replaces it", async () => {
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
    // v1's 4 changes are given back; both messages count: 200 - 3 - 3 - 6.
    expect(v2).toMatchObject({ ok: true, suppliesLeft: 188 });
    if (!v2.ok) return;
    expect(v2.build.continuesId).toBe(v1.build.id);
    expect(v2.replaced).toMatchObject({ id: v1.build.id, status: "cancelled" });
    expect(told).toMatchObject({ mode: "revise", history: [{ version: v1.build.version }] });
    expect(told?.mode === "revise" && told.operations.map((o) => o.ref)).toEqual([
      "gold",
      "wardogs",
      "ranked",
      "vc",
    ]);
    // The replaced plan can't be built or continued any more.
    const { getQmBuild } = await import("@garrison/db");
    const old = await getQmBuild(ctx.db, "q13", v1.build.id);
    if (!old) throw new Error("v1 missing");
    const again = await planBuild(ctx, reviser, f.guild, a, "x", { continues: old });
    expect(!again.ok && again.error).toMatch(/can't be continued/);
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
    // A round at its worst: 12,000 tokens written to the cache, and 6,000 out.
    expect(qmReserveMicros("claude-haiku-5-5")).toBe(4500);
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
    expect(seen[0]?.budgetMicros).toBe(14_000);
    const first = costMicros(TYPICAL.model, TYPICAL.inputTokens, TYPICAL.outputTokens);
    expect(seen[1]?.budgetMicros).toBe(14_000 - first);
  });

  it("charges a typical message 3 supplies, and says so in the chat when they run out", async () => {
    const f = fakeGuild("q19");
    const me = asker(f);
    await used(f, me, 160);
    const bot = scripted([{ reply: "Sure." }]);
    let thread: string | undefined;
    for (let i = 0; i < 13; i++) {
      const turn = await chatTurn(ctx, bot, f.guild, me, { message: "hi", threadId: thread });
      if (!turn.ok) throw new Error(`stopped at ${i}: ${turn.error}`);
      thread = turn.threadId;
    }
    expect(await suppliesUsed(ctx.db, { guildId: "q19" })).toBe(199);
    const out = await chatTurn(ctx, bot, f.guild, me, { message: "hi", threadId: thread });
    expect(!out.ok && out.error).toMatch(
      /200 AI assistant supplies.*Plans you've drafted can still be built/,
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
    expect(overview).toMatchObject({ plan: "free", supplies_left: 200, supplies_in_pool: 200 });
    expect(overview.modules).toContainEqual({
      module: "suggestions",
      page: "Suggestions",
      enabled: true,
      channelId: `#ideas (${ideas})`,
      anonymous: false,
    });
    expect(overview.modules).toContainEqual({
      module: "starboard",
      page: "Starboard",
      status: "not set up",
    });
    expect(JSON.parse(looked.module ?? "{}")).toEqual({
      module: "suggestions",
      page: "Suggestions",
      settings: { enabled: true, channelId: `#ideas (${ideas})`, anonymous: false },
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
    expect(await readSettings(ctx.db, "q22", "suggestions")).toEqual({
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
    expect(await suppliesUsed(ctx.db, { guildId: "q23" })).toBe(0);
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
    expect(await suppliesUsed(ctx.db, { guildId: "q26" })).toBe(0);
  });

  it("gives a message's supplies back when its plan couldn't be made safely", async () => {
    const f = fakeGuild("q20");
    const bad: AiPlan = {
      summary: "x",
      notes: "",
      operations: [op({ kind: "create_role", ref: "Bad Ref!", name: "x" })],
    };
    await chatTurn(ctx, scripted([{ reply: "Here.", plan: bad }]), f.guild, asker(f), {
      message: "go",
    });
    expect(await suppliesUsed(ctx.db, { guildId: "q20" })).toBe(0);
  });
});
