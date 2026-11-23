import { describe, expect, it } from "vitest";
import { carryOver, draftIsEmpty } from "./carry.js";
import type { DraftPlan } from "./planner.js";

type Op = DraftPlan["operations"][number];
const op = (ref: string, name: string, extra: Partial<Op> = {}): Op => ({
  kind: "create_text_channel",
  ref,
  name,
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
  text_kind: null,
  ...extra,
});
const draft = (parts: Partial<DraftPlan>): DraftPlan => ({
  summary: "",
  notes: "",
  operations: [],
  edits: [],
  order: [],
  settings: [],
  posts: [],
  writes: [],
  ...parts,
});

const waiting = draft({
  summary: "LFG section",
  operations: [op("cat", "LFG", { kind: "create_category" }), op("c1", "lfg", { parent: "cat" })],
  settings: [{ module: "suggestions", field: "enabled", value: true }],
  posts: [{ kind: "message", itemId: "rules", channel: "c1" }],
  writes: [{ target: "new_message", messageId: "rules", title: "Rules", body: "Be nice" }],
});

describe("carryOver: one draft, built up message by message", () => {
  it("keeps what a revision leaves out, and adds what it brings", () => {
    const { plan, kept } = carryOver(waiting, draft({ operations: [op("v1", "Squad 1")] }));
    expect(plan.operations.map((o) => o.ref)).toEqual(["cat", "c1", "v1"]);
    expect(plan.settings).toHaveLength(1);
    expect(plan.posts).toHaveLength(1);
    expect(plan.writes).toHaveLength(1);
    expect(kept).toBe(5);
    expect(plan.summary).toBe("LFG section");
  });

  it("takes the revision's version of an item it repeats", () => {
    const { plan } = carryOver(
      waiting,
      draft({
        operations: [op("c1", "looking-for-group", { parent: "cat" })],
        settings: [{ module: "suggestions", field: "enabled", value: false }],
      }),
    );
    expect(plan.operations.map((o) => o.name)).toEqual(["LFG", "looking-for-group"]);
    expect(plan.settings).toEqual([{ module: "suggestions", field: "enabled", value: false }]);
  });

  it("doesn't add a second copy of a new item the revision gave another ref", () => {
    const { plan } = carryOver(
      waiting,
      draft({ operations: [op("lfg2", "lfg", { parent: "cat" })] }),
    );
    expect(plan.operations.map((o) => o.ref)).toEqual(["cat", "lfg2"]);
  });

  it("takes out only what's named in drop, with what leans on it", () => {
    const { plan } = carryOver(waiting, draft({ drop: ["c1", "suggestions.enabled"] }));
    expect(plan.operations.map((o) => o.ref)).toEqual(["cat"]);
    expect(plan.settings).toEqual([]);
    // The post went to the dropped channel, so it goes too; the message it posted stays.
    expect(plan.posts).toEqual([]);
    expect(plan.writes).toHaveLength(1);
    expect(draftIsEmpty(plan)).toBe(false);
  });

  it("drops a whole category with the channels in it", () => {
    const { plan } = carryOver(waiting, draft({ drop: ["cat"] }));
    expect(plan.operations).toEqual([]);
    expect(plan.posts).toEqual([]);
  });

  it("can leave nothing at all, which the chat refuses as an empty draft", () => {
    const { plan } = carryOver(waiting, draft({ drop: ["cat", "rules", "suggestions.enabled"] }));
    expect(draftIsEmpty(plan)).toBe(true);
  });
});

describe("carryOver: references, not names", () => {
  it("dropping the message with the ref 'rules' leaves a channel called rules alone", () => {
    const base = draft({
      operations: [op("c9", "rules")],
      writes: [{ target: "new_message", messageId: "rules", title: "Rules", body: "Be nice" }],
    });
    const { plan } = carryOver(base, draft({ drop: ["rules"] }));
    expect(plan.operations.map((o) => o.name)).toEqual(["rules"]);
    expect(plan.writes).toEqual([]);
  });
});
