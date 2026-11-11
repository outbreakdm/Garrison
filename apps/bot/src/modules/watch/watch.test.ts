import { describe, expect, it } from "vitest";
import { confirmationTitle, dmTitle, escalationReason, hierarchyError } from "./copy.js";
import { pickEscalation } from "./escalation.js";
import { checkHierarchy, type HierarchyInput } from "./hierarchy.js";

const base: HierarchyInput = {
  action: "timeout",
  actorId: "actor",
  botId: "bot",
  ownerId: "owner",
  targetId: "target",
  actorTop: 10,
  botTop: 20,
  targetTop: 5,
  botHasPermission: true,
};

describe("checkHierarchy", () => {
  it("allows a moderator above the target", () => {
    expect(checkHierarchy(base)).toBeNull();
  });
  it.each<[Partial<HierarchyInput>, string]>([
    [{ targetId: "actor" }, "self"],
    [{ targetId: "bot" }, "bot"],
    [{ targetId: "owner" }, "owner"],
    [{ targetTop: 10 }, "actor_below"],
    [{ actorTop: 30, targetTop: 25 }, "bot_below"],
    [{ botHasPermission: false }, "bot_missing_permission"],
  ])("refuses %o as %s", (patch, problem) => {
    expect(checkHierarchy({ ...base, ...patch })).toBe(problem);
  });
  it("lets the owner act on anyone below Garrison", () => {
    expect(checkHierarchy({ ...base, actorId: "owner", actorTop: 0, targetTop: 15 })).toBeNull();
  });
  it("skips role checks for users who are not in the server", () => {
    expect(checkHierarchy({ ...base, action: "ban", targetTop: null })).toBeNull();
  });
  it("lets a warning through even when Garrison sits below the target", () => {
    expect(checkHierarchy({ ...base, action: "warn", actorTop: 30, targetTop: 25 })).toBeNull();
  });
});

describe("pickEscalation", () => {
  const timeoutRule = {
    warnCount: 3,
    windowMinutes: 1440,
    action: "timeout" as const,
    durationSeconds: 3600,
  };
  const banRule = {
    warnCount: 5,
    windowMinutes: 10_080,
    action: "ban" as const,
    durationSeconds: null,
  };
  const rules = [timeoutRule, banRule];
  it("fires when the count reaches the threshold", () => {
    expect(pickEscalation(rules, () => 3)?.action).toBe("timeout");
  });
  it("does not fire again past the threshold", () => {
    expect(pickEscalation(rules, (w) => (w === 1440 ? 4 : 4))).toBeNull();
  });
  it("prefers the highest threshold when several fire", () => {
    const three = [...rules, { ...timeoutRule, warnCount: 5 }];
    expect(pickEscalation(three, () => 5)?.warnCount).toBe(5);
  });
  it("uses each rule's own window", () => {
    expect(pickEscalation(rules, (w) => (w === 10_080 ? 5 : 2))?.action).toBe("ban");
  });
  it("ignores timeout rules without a duration", () => {
    expect(pickEscalation([{ ...timeoutRule, durationSeconds: null }], () => 3)).toBeNull();
  });
});

describe("copy", () => {
  it("writes confirmations and DMs in Garrison's voice", () => {
    expect(confirmationTitle("timeout", "Kel", 3600)).toBe("Timeout applied to Kel for 1 h");
    expect(confirmationTitle("warn", "Kel")).toBe("Warning applied to Kel");
    expect(dmTitle("ban", "Scapewatch")).toBe("You were banned from Scapewatch");
    expect(dmTitle("warn", "Scapewatch")).toBe("You were warned in Scapewatch");
    expect(dmTitle("timeout", "Scapewatch", 600)).toBe(
      "You were timed out in Scapewatch for 10 min",
    );
    expect(escalationReason(3, 1440)).toBe("3 warnings in 24 h");
    expect(escalationReason(5, 10_080)).toBe("5 warnings in 7 d");
  });
  it("explains refusals with the fix", () => {
    expect(hierarchyError("bot_below", "timeout", "@Kel")).toBe(
      "I can't time out @Kel: their highest role sits above mine. Drag Garrison above it in Server Settings → Roles.",
    );
  });
});

describe("reasons are user text", () => {
  it("can't smuggle a disguised link into a member's DM", async () => {
    const { dmCard } = await import("./embeds.js");
    const card = dmCard({
      action: "warn",
      guildName: "S",
      reason: "[Appeal here](https://evil.example)",
    });
    // An escaped "[" stops Discord rendering a masked link; the raw URL stays visible.
    const first = card.blocks?.[0];
    expect(first !== "divider" && first?.text.startsWith("**Reason:** \\[Appeal here]")).toBe(true);
  });
});
