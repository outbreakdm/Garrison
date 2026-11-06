import { describe, expect, it } from "vitest";
import {
  type AiPlan,
  channelName,
  describePlan,
  displayName,
  rollbackOrder,
  type ServerSnapshot,
  validatePlan,
} from "./plan.js";

const server: ServerSnapshot = {
  everyoneId: "g",
  categories: [{ id: "100000000000000001", name: "General" }],
  roles: [
    { id: "200000000000000001", name: "Members", managed: false },
    { id: "200000000000000002", name: "SomeBot", managed: true },
    { id: "g", name: "@everyone", managed: false },
  ],
  channelCount: 10,
  roleCount: 5,
};

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
const plan = (operations: Op[]): AiPlan => ({
  summary: "WARDOGS LFG section",
  operations,
  notes: "",
});

describe("validatePlan", () => {
  it("accepts a sensible build and resolves refs", () => {
    const r = validatePlan(
      plan([
        op({ kind: "create_role", ref: "gold", name: "Gold+", color_hex: "#d4ff3a", hoist: true }),
        op({ kind: "create_category", ref: "wardogs", name: "WARDOGS" }),
        op({
          kind: "create_text_channel",
          ref: "ranked",
          name: "Ranked LFG!!",
          parent: "wardogs",
          private_to: ["gold"],
          slowmode_seconds: 10,
        }),
        op({
          kind: "create_voice_channel",
          ref: "vc",
          name: "Ranked voice",
          parent: "100000000000000001",
          user_limit: 5,
        }),
      ]),
      server,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operations[2]).toMatchObject({
      name: "ranked-lfg",
      parent: "wardogs",
      privateTo: ["gold"],
      slowmodeSeconds: 10,
    });
    expect(r.operations[0]).toMatchObject({ color: 0xd4ff3a, hoist: true });
    expect(describePlan(r.operations, server)).toEqual([
      "+ Role @Gold+ · no permissions · #d4ff3a · shown separately",
      "+ Category WARDOGS",
      "+ #ranked-lfg · in WARDOGS · only @Gold+ can see it · slowmode 10 s",
      "+ Voice Ranked voice · in General · limit 5",
    ]);
  });

  it("rejects refs to things that don't exist or come later", () => {
    const r = validatePlan(
      plan([
        op({ kind: "create_text_channel", ref: "a", name: "a", parent: "later" }),
        op({ kind: "create_category", ref: "later", name: "Later" }),
      ]),
      server,
    );
    expect(r.ok).toBe(false);
  });

  it("won't make a channel private to @everyone or an integration's role", () => {
    for (const role of ["g", "200000000000000002"]) {
      expect(
        validatePlan(
          plan([op({ kind: "create_text_channel", ref: "a", name: "a", private_to: [role] })]),
          server,
        ).ok,
      ).toBe(false);
    }
  });

  it("rejects oversized, duplicate and malformed plans whole", () => {
    expect(
      validatePlan(
        plan(
          Array.from({ length: 21 }, (_, i) =>
            op({ kind: "create_role", ref: `r${i}`, name: `R${i}` }),
          ),
        ),
        server,
      ).ok,
    ).toBe(false);
    expect(
      validatePlan(
        plan([
          op({ kind: "create_role", ref: "x", name: "A" }),
          op({ kind: "create_role", ref: "x", name: "B" }),
        ]),
        server,
      ).ok,
    ).toBe(false);
    expect(
      validatePlan(
        plan([op({ kind: "create_role", ref: "x", name: "A", color_hex: "red" })]),
        server,
      ).ok,
    ).toBe(false);
    expect(
      validatePlan(plan([op({ kind: "create_role", ref: "Robert'); DROP", name: "A" })]), server)
        .ok,
    ).toBe(false);
    expect(validatePlan(plan([]), server).ok).toBe(false);
    expect(
      validatePlan(plan([op({ kind: "create_role", ref: "x", name: "A" })]), {
        ...server,
        roleCount: 250,
      }).ok,
    ).toBe(false);
  });

  it("strips mentions, markdown and control characters from names", () => {
    expect(displayName("@everyone **Admins** ‮txt.exe")).toBe("everyone Admins txt.exe");
    expect(channelName("  <#123> General Chat 💬 ")).toBe("123-general-chat");
    expect(
      validatePlan(plan([op({ kind: "create_role", ref: "x", name: "@@@" })]), server).ok,
    ).toBe(false);
  });
});

describe("rollbackOrder", () => {
  it("removes channels, then categories, then roles", () => {
    const order = rollbackOrder([
      { kind: "role", id: "r", name: "r" },
      { kind: "category", id: "c", name: "c" },
      { kind: "channel", id: "ch", name: "ch" },
    ]);
    expect(order.map((o) => o.kind)).toEqual(["channel", "category", "role"]);
  });
});
