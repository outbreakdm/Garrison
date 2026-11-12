import { describe, expect, it } from "vitest";
import type { BackupChannel, ServerBackup } from "./backups";
import { TEMPLATE_APPLY_MAX, templateApplyPlan, toTemplate } from "./server-templates";

const channel = (over: Partial<BackupChannel>): BackupChannel => ({
  id: "c",
  name: "general",
  type: 0,
  parentId: null,
  position: 0,
  topic: null,
  nsfw: false,
  rateLimit: 0,
  userLimit: 0,
  overwrites: [],
  ...over,
});

const template: ServerBackup = {
  version: 1,
  roles: [
    {
      id: "r1",
      name: "Raiders",
      color: 0,
      hoist: false,
      mentionable: false,
      permissions: "0",
      position: 2,
    },
    {
      id: "r2",
      name: "Officers",
      color: 0,
      hoist: true,
      mentionable: false,
      permissions: "0",
      position: 3,
    },
  ],
  channels: [
    channel({ id: "cat1", name: "Raids", type: 4 }),
    channel({ id: "cat2", name: "Community", type: 4, position: 1 }),
    channel({ id: "c1", name: "signups", parentId: "cat1" }),
    channel({ id: "c2", name: "general", parentId: "cat2" }),
    channel({
      id: "c3",
      name: "officers",
      parentId: "cat1",
      overwrites: [
        { id: "r2", kind: "role", allow: "1024", deny: "0" },
        { id: "u1", kind: "member", allow: "1024", deny: "0" },
      ],
    }),
  ],
};

describe("server templates", () => {
  it("drop member permissions so they can travel between servers", () => {
    const t = toTemplate(template);
    expect(t.channels.find((c) => c.id === "c3")?.overwrites).toEqual([
      { id: "r2", kind: "role", allow: "1024", deny: "0" },
    ]);
  });

  it("create only what the server lacks by name, case aside", () => {
    const plan = templateApplyPlan(template, {
      roles: [{ id: "x1", name: "raiders" }],
      channels: [
        { id: "y1", name: "Community", type: 4, parentId: null },
        { id: "y2", name: "General", type: 0, parentId: "y1" },
      ],
    });
    expect(plan.existingRoles).toEqual({ r1: "x1" });
    expect(plan.roles.map((r) => r.name)).toEqual(["Officers"]);
    expect(plan.existingCategories).toEqual({ cat2: "y1" });
    expect(plan.categories.map((c) => c.name)).toEqual(["Raids"]);
    // #general already exists in Community; both Raids channels are new.
    expect(plan.channels.map((c) => c.name).sort()).toEqual(["officers", "signups"]);
    expect(plan.skipped).toBe(0);
  });

  it("caps how much one apply creates", () => {
    const big: ServerBackup = {
      version: 1,
      roles: [],
      channels: Array.from({ length: TEMPLATE_APPLY_MAX + 5 }, (_, i) =>
        channel({ id: `c${i}`, name: `room-${i}`, position: i }),
      ),
    };
    const plan = templateApplyPlan(big, { roles: [], channels: [] });
    expect(plan.channels).toHaveLength(TEMPLATE_APPLY_MAX);
    expect(plan.skipped).toBe(5);
  });
});
