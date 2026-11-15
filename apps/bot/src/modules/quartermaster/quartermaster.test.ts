import {
  aiAllowance,
  aiSpendSince,
  costMicros,
  qmReserveMicros,
  schema,
  suppliesUsed,
  upsertGuild,
} from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import { ChannelType, Collection, type Guild, PermissionFlagsBits } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import { chatTurn } from "./chat.js";
import type { AiPlan } from "./plan.js";
import type { ChatInput, Planner, PlannerInput } from "./planner.js";
import { applyBuild, channelOverwrites, planBuild, undoBuild } from "./service.js";

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
const stub = (plan: AiPlan): Planner => ({ plan: async () => ({ ok: true, plan, model: "stub" }) });

/** A guild that records every create/delete. `failOn` makes the Nth create throw. */
function fakeGuild(id: string, failOn?: number) {
  let n = 0;
  let creates = 0;
  const calls: { kind: string; options: Record<string, unknown> }[] = [];
  const deleted: string[] = [];
  const channels = new Collection<
    string,
    { id: string; name: string; type: ChannelType; delete: () => Promise<void> }
  >();
  const roles = new Collection<
    string,
    { id: string; name: string; managed: boolean; position: number; delete: () => Promise<void> }
  >();
  roles.set(id, { id, name: "@everyone", managed: false, position: 0, delete: async () => {} });
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
        delete: del,
      });
    else
      channels.set(newId, {
        id: newId,
        name: String(options.name),
        type: options.type as ChannelType,
        delete: del,
      });
    return { id: newId, name: String(options.name) };
  };
  const guild = {
    id,
    name: id,
    roles: {
      everyone: { id },
      cache: roles,
      create: (o: Record<string, unknown>) => make("role", o),
    },
    channels: { cache: channels, create: (o: Record<string, unknown>) => make("channel", o) },
    members: {
      me: {
        id: "garrison",
        permissions: { has: () => true },
        roles: { highest: { position: 10 } },
      },
    },
  };
  return { guild: guild as unknown as Guild, calls, deleted, channels, roles };
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
    expect(undone).toEqual({ ok: true, removed: 2, missing: 0, failed: 0 });
    expect(f.deleted).toEqual(["q3-2", "q3-1"]); // category before role
    expect(f.channels.has("pre-existing")).toBe(true);
    expect(await undoBuild(ctx, f.guild, { ...stored, status: "applied" }, "2")).toMatchObject({
      ok: false,
    });
  });

  it("counts supplies: a message is 3, each change 1, and the rest carry over", async () => {
    const f = fakeGuild("q4");
    const a = asker(f);
    const first = await planBuild(ctx, stub(rolesPlan(10)), f.guild, a, "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 27 });
    const small = await planBuild(ctx, stub(rolesPlan(3)), f.guild, a, "x");
    expect(small).toMatchObject({ ok: true, suppliesLeft: 21 });
    // 21 left: the message takes 3, so the next plan may make up to 18. One asking for more
    // is refused whole, and the refusal gives its message back.
    const tooBig = await planBuild(ctx, stub(rolesPlan(19)), f.guild, a, "x");
    expect(!tooBig.ok && tooBig.error).toMatch(/only 18 supplies are left for changes today/);
    expect(await planBuild(ctx, stub(rolesPlan(18)), f.guild, a, "x")).toMatchObject({
      ok: true,
      suppliesLeft: 0,
    });
    const none = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
    expect(!none.ok && none.error).toMatch(
      /your 40 AI builder supplies for today on Free servers.*Garrison Pro gives a server 300/,
    );
  });

  it("gives the planner what's left after the message as its limit", async () => {
    const f = fakeGuild("q12");
    const a = asker(f);
    expect((await planBuild(ctx, stub(rolesPlan(20)), f.guild, a, "x")).ok).toBe(true);
    expect((await planBuild(ctx, stub(rolesPlan(9)), f.guild, a, "x")).ok).toBe(true);
    let limit: number | undefined;
    const seeing: Planner = {
      plan: async (input) => {
        limit = input.maxOperations;
        return { ok: true, plan: rolesPlan(2), model: "stub" };
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
    expect((await planBuild(ctx, stub(rolesPlan(20)), one.guild, owner, "x")).ok).toBe(true);
    const second = await planBuild(ctx, stub(rolesPlan(14)), two.guild, owner, "x");
    expect(second).toMatchObject({ ok: true, suppliesLeft: 0 });
    const third = await planBuild(ctx, stub(sectionPlan), three.guild, owner, "x");
    expect(!third.ok && third.error).toMatch(/your 40 AI builder supplies for today on Free/);
    // Someone else can still use the third server's own supplies.
    const other = { id: "98001", tag: "other" };
    expect((await planBuild(ctx, stub(sectionPlan), three.guild, other, "x")).ok).toBe(true);
  });

  it("charges for every message, so many tiny plans can't run up the AI bill", async () => {
    const f = fakeGuild("q14");
    const a = asker(f);
    for (let i = 0; i < 10; i++)
      expect((await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x")).ok).toBe(true);
    const eleventh = await planBuild(ctx, stub(rolesPlan(1)), f.guild, a, "x");
    expect(!eleventh.ok && eleventh.error).toMatch(/your 40 AI builder supplies/);
  });

  it("gives an Agency seat 400 supplies a day, counted per server", async () => {
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
      suppliesPerDay: 400,
      suppliesLeft: 400,
      perPerson: false,
    });
    const first = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x");
    expect(first).toMatchObject({ ok: true, suppliesLeft: 393 });
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
        return { ok: true, plan: rolesPlan(6), model: "stub" };
      },
    };
    const v2 = await planBuild(ctx, reviser, f.guild, a, "add two more roles", {
      continues: v1.build,
    });
    // v1's 4 changes are given back; both messages count: 40 - 3 - 3 - 6.
    expect(v2).toMatchObject({ ok: true, suppliesLeft: 28 });
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
        return { ok: true, plan: rolesPlan(2), model: "stub" };
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
    expect(!eleventh.ok && eleventh.error).toMatch(/lot of AI builder use in one hour/);
  });

  it("gives the supplies back when a plan fails, but caps attempts per hour", async () => {
    const f = fakeGuild("q6");
    const failing: Planner = {
      plan: async () => ({
        ok: false,
        error: "declined",
        usage: { model: "claude-haiku-5-5", inputTokens: 3000, outputTokens: 500 },
      }),
    };
    for (let i = 0; i < 9; i++)
      expect(await planBuild(ctx, failing, f.guild, asker(f), "x")).toMatchObject({ ok: false });
    // Failures used no supplies.
    expect(await suppliesUsed(ctx.db, { guildId: "q6" })).toBe(0);
    expect((await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x")).ok).toBe(true);
    expect(await suppliesUsed(ctx.db, { guildId: "q6" })).toBe(7);
    // But every attempt counts toward 10 an hour, and failures' cost is kept.
    const blocked = await planBuild(ctx, stub(sectionPlan), f.guild, asker(f), "x");
    expect(!blocked.ok && blocked.error).toMatch(/lot of AI builder use in one hour/);
    const spend = await aiSpendSince(ctx.db, new Date(Date.now() - 60_000));
    expect(spend.dollars).toBeCloseTo(9 * 0.00055, 6);
  });

  it("stops every server once the day's budget is spent", async () => {
    const f = fakeGuild("q7");
    const capped = { ...ctx, qmDailyBudgetUsd: 0.000001 };
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
    expect(qmReserveMicros("claude-haiku-5-5")).toBe(3600);
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

describe("AI builder chat", () => {
  /** A chat model that answers each turn from a script, recording what it was told. */
  const scripted = (
    turns: { reply: string; choices?: string[]; plan?: AiPlan | null }[],
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
          plan: t?.plan ?? null,
          model: "stub",
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

  it("costs 3 supplies a message, and says so in the chat when they run out", async () => {
    const f = fakeGuild("q19");
    const me = asker(f);
    const bot = scripted([{ reply: "Sure." }]);
    let thread: string | undefined;
    for (let i = 0; i < 13; i++) {
      const turn = await chatTurn(ctx, bot, f.guild, me, { message: "hi", threadId: thread });
      if (!turn.ok) throw new Error(`stopped at ${i}: ${turn.error}`);
      thread = turn.threadId;
    }
    expect(await suppliesUsed(ctx.db, { guildId: "q19" })).toBe(39);
    const out = await chatTurn(ctx, bot, f.guild, me, { message: "hi", threadId: thread });
    expect(!out.ok && out.error).toMatch(
      /40 AI builder supplies.*Plans you've drafted can still be built/,
    );
    const { listQmThread } = await import("@garrison/db");
    const log = await listQmThread(ctx.db, "q19", me.id, thread ?? "");
    expect(log.at(-1)?.text).toMatch(/Plans you've drafted can still be built/);
  });

  it("lets the chat read this server's settings, with names for channels and roles", async () => {
    const f = fakeGuild("q21");
    await upsertGuild(ctx.db, { id: "q21", name: "q21" });
    const ideas = "123456789012345021";
    f.channels.set(ideas, {
      id: ideas,
      name: "ideas",
      type: ChannelType.GuildText,
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
        return { ok: true, reply: "Suggestions are on.", choices: [], plan: null, model: "stub" };
      },
    };
    expect((await chatTurn(ctx, bot, f.guild, asker(f), { message: "what's on?" })).ok).toBe(true);
    const overview = JSON.parse(looked.overview ?? "{}");
    expect(overview).toMatchObject({ plan: "free", supplies_left_after_this_message: 37 });
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
