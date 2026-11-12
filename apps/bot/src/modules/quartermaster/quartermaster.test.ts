import {
  aiCreditsUsedToday,
  aiSpendSince,
  costMicros,
  qmReserveMicros,
  schema,
  upsertGuild,
} from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import { ChannelType, Collection, type Guild, PermissionFlagsBits } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import type { AiPlan } from "./plan.js";
import type { Planner } from "./planner.js";
import { applyBuild, planBuild, undoBuild } from "./service.js";

type Op = AiPlan["operations"][number];
const op = (o: Partial<Op> & Pick<Op, "kind" | "ref" | "name">): Op => ({
  parent: null,
  topic: null,
  slowmode_seconds: null,
  user_limit: null,
  private_to: [],
  color_hex: null,
  hoist: null,
  mentionable: null,
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
const taner = { id: "1", tag: "taner" };

describe("Quartermaster end to end", () => {
  it("builds with zero-permission roles and allowlisted channel access, once", async () => {
    const f = fakeGuild("q1");
    const planned = await planBuild(ctx, stub(sectionPlan), f.guild, taner, "a WARDOGS section");
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
    const planned = await planBuild(ctx, stub(hostile), f.guild, taner, "anything");
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
    const planned = await planBuild(ctx, stub(sectionPlan), f.guild, taner, "a WARDOGS section");
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

  it("gives a Free server 3 plans a day, and says when they come back", async () => {
    const f = fakeGuild("q4");
    for (let i = 0; i < 3; i++)
      expect((await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x")).ok).toBe(true);
    const fourth = await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x");
    expect(fourth).toMatchObject({ ok: false });
    expect(!fourth.ok && fourth.error).toMatch(
      /today's 3 Quartermaster plans.*Garrison Pro gives 15/,
    );
  });

  it("lets a Pro server past Free's 3, up to 10 an hour", async () => {
    const f = fakeGuild("q5");
    await upsertGuild(ctx.db, { id: "q5", name: "q5" });
    await ctx.db.insert(schema.guildPlans).values({ guildId: "q5", plan: "pro" });
    for (let i = 0; i < 10; i++)
      expect((await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x")).ok).toBe(true);
    const eleventh = await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x");
    expect(!eleventh.ok && eleventh.error).toMatch(/lot of plans in one hour/);
  });

  it("gives the credit back when a plan fails, but caps attempts per hour", async () => {
    const f = fakeGuild("q6");
    const failing: Planner = {
      plan: async () => ({
        ok: false,
        error: "declined",
        usage: { model: "claude-haiku-5-5", inputTokens: 3000, outputTokens: 500 },
      }),
    };
    for (let i = 0; i < 9; i++)
      expect(await planBuild(ctx, failing, f.guild, taner, "x")).toMatchObject({ ok: false });
    // Failures used no credits.
    expect(await aiCreditsUsedToday(ctx.db, "q6", "qm")).toBe(0);
    expect((await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x")).ok).toBe(true);
    expect(await aiCreditsUsedToday(ctx.db, "q6", "qm")).toBe(1);
    // But every attempt counts toward 10 an hour, and failures' cost is kept.
    const blocked = await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x");
    expect(!blocked.ok && blocked.error).toMatch(/lot of plans in one hour/);
    const spend = await aiSpendSince(ctx.db, new Date(Date.now() - 60_000));
    expect(spend.dollars).toBeCloseTo(9 * 0.00055, 6);
  });

  it("stops every server once the day's budget is spent", async () => {
    const f = fakeGuild("q7");
    const capped = { ...ctx, qmDailyBudgetUsd: 0.000001 };
    const outcome = await planBuild(capped, stub(sectionPlan), f.guild, taner, "x");
    expect(!outcome.ok && outcome.error).toMatch(/limit for today across all servers/);
  });
});

describe("AI costs", () => {
  it("prices calls from the model's list price, and unknown models as the dearest", () => {
    // 3,400 in and 2,000 out on Haiku: $0.00034 + $0.001.
    expect(costMicros("claude-haiku-5-5", 3400, 2000)).toBe(1340);
    expect(costMicros("claude-opus-5-5", 1000, 1000)).toBe(24000);
    expect(costMicros("some-new-model", 1000, 1000)).toBe(24000);
    expect(qmReserveMicros("claude-haiku-5-5")).toBe(2600);
  });
});
