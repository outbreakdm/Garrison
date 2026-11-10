import type { SetupFacts } from "@garrison/db";
import { describe, expect, it } from "vitest";
import {
  type AttentionInput,
  needsAttention,
  PLAN_TTL_MS,
  requestPage,
  setupSteps,
  showSetup,
  span,
} from "./attention";
import { latestOutcome, payloadField } from "./outcome";

const now = new Date("2026-11-10T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const later = (ms: number) => new Date(now.getTime() + ms);
const H = 3_600_000;

const calm: AttentionInput = {
  now,
  lockdown: null,
  quarantines: [],
  build: null,
  raids: [],
  actions: [],
  health: { checks: [{ status: "ok", text: "Can manage roles" }] },
};

describe("needs attention", () => {
  it("is empty when nothing needs doing", () => {
    expect(needsAttention(calm)).toEqual([]);
  });

  it("lists a lockdown and quarantines first, each linking to its fix", () => {
    const items = needsAttention({
      ...calm,
      raids: [
        {
          id: "r1",
          title: "Molten Core",
          startsAt: later(5 * H),
          slots: [{ name: "Healer", count: 2 }],
          seated: [],
        },
      ],
      lockdown: { source: "anti_raid", startedAt: ago(10 * 60_000), endsAt: later(5 * 60_000) },
      quarantines: [
        { userTag: "rogue", kicked: false },
        { userTag: "spam-bot", kicked: true },
      ],
    });
    expect(items.map((i) => [i.key, i.tone, i.href])).toEqual([
      ["lockdown", "alert", "gatehouse#lockdown"],
      ["quarantine", "alert", "gatehouse#quarantines"],
      ["raid-r1", "caution", "rally#raid-r1"],
    ]);
    expect(items[0]?.detail).toBe("Anti-raid locked it 10 min ago. It lifts by itself in 5 min.");
    // A kicked bot has no roles to give back, so only one member counts.
    expect(items[1]?.title).toBe("1 member is quarantined by anti-nuke");
    expect(items[1]?.detail).toContain("rogue");
  });

  it("flags raids starting soon that are short, and says what they need", () => {
    const items = needsAttention({
      ...calm,
      raids: [
        {
          id: "full",
          title: "Full raid",
          startsAt: later(H),
          slots: [{ name: "Tank", count: 1 }],
          seated: [{ role: "Tank" }],
        },
        {
          id: "short",
          title: "Molten Core",
          startsAt: later(3 * H),
          slots: [
            { name: "Tank", count: 2 },
            { name: "Healer", count: 4 },
          ],
          seated: [{ role: "Tank" }, { role: "Healer" }, { role: "Healer" }],
        },
        {
          id: "far",
          title: "Next month",
          startsAt: later(30 * 24 * H),
          slots: [{ name: "Tank", count: 2 }],
          seated: [],
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Molten Core is 3 short",
      detail: "Starts in 3 h. Needs 1 Tank, 2 Healer.",
    });
  });

  it("shows a waiting plan until it expires, and a build that stopped partway", () => {
    const build = { version: 4, status: "pending", requestedByTag: "taner" };
    expect(needsAttention({ ...calm, build: { ...build, createdAt: ago(5 * 60_000) } })).toEqual([
      expect.objectContaining({
        key: "plan",
        href: "quartermaster#plan",
        detail: "Asked by taner. Nothing is built until it's applied, and it expires in 10 min.",
      }),
    ]);
    expect(needsAttention({ ...calm, build: { ...build, createdAt: ago(PLAN_TTL_MS) } })).toEqual(
      [],
    );
    expect(
      needsAttention({ ...calm, build: { ...build, status: "failed", createdAt: ago(H) } })[0],
    ).toMatchObject({ key: "build", tone: "alert", title: "Build v4 stopped partway" });
  });

  it("lists failed requests from the last day, unless the same kind worked since", () => {
    const items = needsAttention({
      ...calm,
      actions: [
        { kind: "raid_signup", status: "done", message: "ok", createdAt: ago(1000), payload: {} },
        {
          kind: "mod_action",
          status: "failed",
          message: "You need Kick Members.",
          createdAt: ago(2 * H),
          payload: { userId: "123456789012345678" },
        },
        {
          kind: "raid_signup",
          status: "failed",
          message: "Raid is full.",
          createdAt: ago(3 * H),
          payload: {},
        },
        { kind: "purge", status: "failed", message: "old", createdAt: ago(30 * H), payload: {} },
      ],
    });
    expect(items.map((i) => [i.title, i.detail, i.href])).toEqual([
      [
        "Moderate member failed 2 h ago",
        "You need Kick Members.",
        "watch/member/123456789012345678",
      ],
    ]);
  });

  it("counts health checks that aren't ok, as an alert when one needs fixing", () => {
    const [item] = needsAttention({
      ...calm,
      health: {
        checks: [
          { status: "ok", text: "fine" },
          { status: "warn", text: "Role order" },
          { status: "fix", text: "Missing Ban Members" },
        ],
      },
    });
    expect(item).toMatchObject({
      key: "health",
      tone: "alert",
      title: "2 health checks need a look",
    });
  });

  it("links every kind of request back to its page", () => {
    expect(requestPage("lockdown_start", {})).toBe("gatehouse#lockdown");
    expect(requestPage("mod_action", { userId: "../../x" })).toBe("watch");
    expect(requestPage("qm_apply", {})).toBe("quartermaster");
    expect(requestPage("lfg_join", {})).toBe("rally");
    expect(requestPage("run_health", {})).toBe("#health");
  });

  it("says spans of time plainly", () => {
    expect([span(1000), span(45 * 60_000), span(5 * H), span(72 * H)]).toEqual([
      "1 min",
      "45 min",
      "5 h",
      "3 d",
    ]);
  });
});

const fresh: SetupFacts = {
  logChannelId: null,
  antiRaidEnabled: true,
  alertChannelId: null,
  verifyRoleId: null,
  ranksDecided: false,
  ranksEnabled: false,
  rallyUsed: false,
  setupDismissed: false,
};

describe("setup checklist", () => {
  it("starts with every step to do", () => {
    expect(setupSteps(fresh).map((s) => [s.key, s.done])).toEqual([
      ["log", false],
      ["verify", false],
      ["antiraid", false],
      ["ranks", false],
      ["rally", false],
    ]);
    expect(showSetup(fresh)).toBe(true);
  });

  it("counts anti-raid as done once its alerts have a channel, the log channel included", () => {
    const done = (f: Partial<SetupFacts>) =>
      setupSteps({ ...fresh, ...f }).find((s) => s.key === "antiraid")?.done;
    expect(done({ logChannelId: "1" })).toBe(true);
    expect(done({ alertChannelId: "2" })).toBe(true);
    expect(done({ alertChannelId: "2", antiRaidEnabled: false })).toBe(false);
  });

  it("goes away when every step is done, or when someone hides it", () => {
    const all: SetupFacts = {
      ...fresh,
      logChannelId: "1",
      verifyRoleId: "2",
      ranksDecided: true,
      rallyUsed: true,
    };
    expect(showSetup(all)).toBe(false);
    expect(showSetup({ ...fresh, setupDismissed: true })).toBe(false);
  });
});

describe("outcome beside a control", () => {
  const base = { status: "done", requestedById: "me", createdAt: ago(60_000) };
  const actions = [
    { ...base, kind: "raid_signup", payload: { eventId: "b" } },
    { ...base, kind: "raid_signup", requestedById: "other", payload: { eventId: "a" } },
    { ...base, kind: "raid_withdraw", payload: { eventId: "a" } },
    { ...base, kind: "raid_signup", payload: { eventId: "a" } },
  ];

  it("finds your newest matching request", () => {
    const found = latestOutcome(actions, {
      userId: "me",
      kinds: ["raid_signup", "raid_withdraw"],
      match: (p) => payloadField(p, "eventId") === "a",
      now,
    });
    expect(found).toBe(actions[2]);
  });

  it("ignores requests older than a few minutes", () => {
    const old = [{ ...base, kind: "raid_signup", payload: {}, createdAt: ago(H) }];
    expect(latestOutcome(old, { userId: "me", kinds: ["raid_signup"], now })).toBeNull();
  });

  it("reads only string and number payload fields", () => {
    expect(payloadField({ caseNumber: 7 }, "caseNumber")).toBe("7");
    expect(payloadField({ id: { nested: 1 } }, "id")).toBeNull();
    expect(payloadField(null, "id")).toBeNull();
  });
});
