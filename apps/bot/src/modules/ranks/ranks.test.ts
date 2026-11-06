import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  earnedRewards,
  progressBar,
  type RoleFacts,
  rewardProblem,
  rewardProblemText,
} from "./rules.js";

const role = (over: Partial<RoleFacts> = {}): RoleFacts => ({
  id: "r",
  name: "Veteran",
  managed: false,
  position: 3,
  permissions: 0n,
  ...over,
});

describe("rewardProblem", () => {
  it("accepts plain cosmetic roles below Garrison", () => {
    expect(
      rewardProblem(role({ permissions: PermissionFlagsBits.SendMessages }), "g", 10),
    ).toBeNull();
  });
  it.each<[Partial<RoleFacts>, string]>([
    [{ id: "g" }, "everyone"],
    [{ managed: true }, "managed"],
    [{ permissions: PermissionFlagsBits.Administrator }, "dangerous"],
    [{ permissions: PermissionFlagsBits.BanMembers }, "dangerous"],
    [{ permissions: PermissionFlagsBits.ManageRoles }, "dangerous"],
    [{ permissions: PermissionFlagsBits.MentionEveryone }, "dangerous"],
    [{ position: 10 }, "above_bot"],
  ])("refuses %o as %s", (over, problem) => {
    expect(rewardProblem(role(over), "g", 10)).toBe(problem);
  });
  it("names the powers that make a role unsafe", () => {
    expect(
      rewardProblemText("dangerous", role({ permissions: PermissionFlagsBits.Administrator })),
    ).toContain("Administrator");
  });
});

describe("helpers", () => {
  it("earns every reward at or below the level", () => {
    expect(
      earnedRewards([{ level: 5 }, { level: 10 }, { level: 20 }], 10).map((r) => r.level),
    ).toEqual([5, 10]);
  });
  it("draws a progress bar", () => {
    expect(progressBar(0, 100)).toBe("▱▱▱▱▱▱▱▱▱▱");
    expect(progressBar(55, 100)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(progressBar(500, 100)).toBe("▰▰▰▰▰▰▰▰▰▰");
  });
});
