import { describe, expect, it } from "vitest";
import { subRoleChanges } from "./sub-roles.js";

describe("Twitch subscriber roles", () => {
  it("gives subscribers in the server the role and takes it from everyone else holding it", () => {
    const subscribers = new Set(["ana", "kel", "away"]);
    const holders = new Set(["kel", "lapsed"]);
    const members = new Set(["ana", "kel", "lapsed"]);
    expect(subRoleChanges(subscribers, holders, members)).toEqual({
      add: ["ana"],
      remove: ["lapsed"],
    });
  });
});
