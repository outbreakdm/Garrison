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

  it("caps builds per server per hour", async () => {
    const f = fakeGuild("q4");
    for (let i = 0; i < 5; i++)
      expect((await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x")).ok).toBe(true);
    expect(await planBuild(ctx, stub(sectionPlan), f.guild, taner, "x")).toMatchObject({
      ok: false,
    });
  });
});
