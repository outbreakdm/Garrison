import { describeEdits } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { type AiEdit, MAX_DELETES } from "./edits.js";
import { type AiPlan, type ServerSnapshot, validatePlan } from "./plan.js";

const CAT = "100000000000000001";
const GENERAL = "300000000000000001";
const VOICE = "300000000000000002";
const RULES = "300000000000000003";
const LOGS = "300000000000000004";
const MEMBERS = "200000000000000001";
const STAFF = "200000000000000002";
const BOT = "200000000000000003";

const server: ServerSnapshot = {
  everyoneId: "g",
  categories: [{ id: CAT, name: "Community" }],
  channels: [
    { id: GENERAL, name: "general", parentId: CAT, kind: "text" },
    { id: VOICE, name: "Lounge", parentId: CAT, kind: "voice" },
    { id: RULES, name: "rules", parentId: null, kind: "text" },
    { id: LOGS, name: "mod-log", parentId: null, kind: "text" },
  ],
  roles: [
    { id: STAFF, name: "Staff", managed: false, movable: false },
    { id: BOT, name: "SomeBot", managed: true, movable: false },
    { id: MEMBERS, name: "Members", managed: false, movable: true },
    { id: "g", name: "@everyone", managed: false, movable: false },
  ],
  protectedChannels: {
    [RULES]: "Discord requires a rules channel in a Community server.",
    [LOGS]: "Garrison's watch settings use it. Change that setting first.",
  },
  channelCount: 10,
  roleCount: 5,
};

const edit = (e: Partial<AiEdit> & Pick<AiEdit, "kind" | "id">): AiEdit => ({
  name: null,
  topic: null,
  slowmode_seconds: null,
  user_limit: null,
  nsfw: null,
  parent: null,
  access: null,
  sync_with_category: null,
  color_hex: null,
  hoist: null,
  mentionable: null,
  permissions: null,
  ...e,
});
const plan = (edits: AiEdit[], extra: Partial<AiPlan> = {}): AiPlan => ({
  summary: "Tidy up",
  operations: [],
  notes: "",
  edits,
  ...extra,
});
const errorsOf = (p: AiPlan) => {
  const r = validatePlan(p, server);
  return r.ok ? [] : r.errors;
};

describe("editing what exists", () => {
  it("renames, re-topics and locks down a channel, and edits a plain role", () => {
    const r = validatePlan(
      plan([
        edit({
          kind: "edit_channel",
          id: GENERAL,
          name: "Chat Here",
          topic: "Say hi",
          access: { private_to: [MEMBERS], read_only: false, posters: [] },
        }),
        edit({
          kind: "edit_role",
          id: MEMBERS,
          color_hex: "#d4ff3a",
          permissions: ["attach_files"],
        }),
      ]),
      server,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edits[0]).toMatchObject({
      kind: "edit_channel",
      id: GENERAL,
      was: "general",
      name: "chat-here", // text channel names follow Discord's rules
      topic: "Say hi",
      access: { privateTo: [MEMBERS], readOnly: false, posters: [] },
    });
    expect(r.edits[1]).toMatchObject({ color: 0xd4ff3a, permissions: ["attach_files"] });
  });

  it("counts each edit as one change", () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      edit({ kind: "edit_channel", id: GENERAL, name: `chat-${i}` }),
    );
    expect(errorsOf(plan(many)).join(" ")).toMatch(/the most a build can make is 20/);
  });

  it("leaves staff, bot and @everyone roles alone", () => {
    expect(errorsOf(plan([edit({ kind: "edit_role", id: STAFF, name: "Mods" })]))[0]).toMatch(
      /admin or moderation powers/,
    );
    expect(errorsOf(plan([edit({ kind: "delete_role", id: BOT })]))[0]).toMatch(
      /admin or moderation powers, belongs to a bot/,
    );
    expect(errorsOf(plan([edit({ kind: "edit_role", id: "g", hoist: true })]))[0]).toMatch(
      /@everyone/,
    );
  });

  it("refuses edits that change nothing, name something missing, or don't fit the kind", () => {
    expect(errorsOf(plan([edit({ kind: "edit_channel", id: GENERAL })]))[0]).toMatch(
      /doesn't change anything/,
    );
    expect(errorsOf(plan([edit({ kind: "edit_channel", id: "999", name: "x" })]))[0]).toMatch(
      /isn't a channel in this server/,
    );
    expect(errorsOf(plan([edit({ kind: "edit_channel", id: VOICE, topic: "hi" })]))[0]).toMatch(
      /can't have a topic/,
    );
    expect(
      errorsOf(
        plan([
          edit({
            kind: "edit_channel",
            id: GENERAL,
            access: { private_to: [], read_only: false, posters: [STAFF] },
          }),
        ]),
      )[0],
    ).toMatch(/doesn't make it read-only/);
    expect(
      errorsOf(
        plan([
          edit({ kind: "edit_channel", id: GENERAL, name: "a" }),
          edit({ kind: "edit_channel", id: GENERAL, topic: "b" }),
        ]),
      )[0],
    ).toMatch(/changed twice/);
  });
});

describe("deleting", () => {
  it("deletes a plain channel, category or role, and says it's permanent", () => {
    const r = validatePlan(
      plan([
        edit({ kind: "delete_channel", id: VOICE }),
        edit({ kind: "delete_category", id: CAT }),
        edit({ kind: "delete_role", id: MEMBERS }),
      ]),
      server,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = describeEdits(r.edits, new Map());
    expect(lines[0]).toBe("− Delete Lounge (can't be undone)");
    expect(lines[1]).toMatch(/its channels stay, outside any category; can't be undone/);
    expect(lines[2]).toBe("− Delete @Members (can't be undone)");
  });

  it("never deletes what Discord or Garrison depends on", () => {
    expect(errorsOf(plan([edit({ kind: "delete_channel", id: RULES })]))[0]).toMatch(
      /Discord requires a rules channel/,
    );
    expect(errorsOf(plan([edit({ kind: "delete_channel", id: LOGS })]))[0]).toMatch(
      /Garrison's watch settings use it/,
    );
  });

  it(`deletes ${MAX_DELETES} things at most`, () => {
    const roles = Array.from({ length: MAX_DELETES + 1 }, (_, i) => ({
      id: `20000000000000010${i}`.slice(0, 18),
      name: `R${i}`,
      managed: false,
      movable: true,
    }));
    const big = { ...server, roles: [...server.roles, ...roles] };
    const r = validatePlan(plan(roles.map((x) => edit({ kind: "delete_role", id: x.id }))), big);
    expect(r.ok ? [] : r.errors).toContain(
      `A plan can delete ${MAX_DELETES} things at most; deletions are permanent.`,
    );
  });

  it("refuses a plan that leans on what it deletes", () => {
    const errors = errorsOf(
      plan([edit({ kind: "delete_category", id: CAT })], {
        operations: [
          {
            text_kind: null,
            kind: "create_text_channel",
            ref: "news",
            name: "news",
            parent: CAT,
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
          },
        ],
      }),
    );
    expect(errors.join(" ")).toMatch(/New news uses category Community, which the plan deletes/);
    const ordered = errorsOf(
      plan([edit({ kind: "delete_channel", id: VOICE })], {
        order: [{ scope: "channels", parent: CAT, items: [VOICE, GENERAL] }],
      }),
    );
    expect(ordered.join(" ")).toMatch(/order lists something the plan deletes/);
  });
});

describe("describeEdits", () => {
  it("says what changes in plain words", () => {
    const names = new Map([[MEMBERS, "Members"]]);
    const [line] = describeEdits(
      [
        {
          kind: "edit_channel",
          id: GENERAL,
          was: "#general",
          name: "chat",
          slowmodeSeconds: 0,
          access: { privateTo: [MEMBERS], readOnly: true, posters: [] },
        },
      ],
      names,
    );
    expect(line).toBe(
      "~ #general: renamed chat · no slowmode · only @Members can see it · read-only",
    );
  });
});
