import { describe, expect, it } from "vitest";
import { createRaidForm, moveSignupForm } from "./rally-schema";

const ok = {
  channelId: "300000000000000001",
  title: " Molten Core ",
  date: "2026-11-12",
  time: "20:00",
  roles: "Tank 4, Healer 8, DPS 28",
  note: "",
  repeatWeekly: "on",
};

describe("createRaidForm", () => {
  it("joins date and time in the server's zone format", () => {
    expect(createRaidForm.parse(ok)).toEqual({
      channelId: "300000000000000001",
      title: "Molten Core",
      when: "2026-11-12 20:00",
      roles: "Tank 4, Healer 8, DPS 28",
      note: null,
      repeatWeekly: true,
    });
  });
  it.each([
    ["channelId", "general"],
    ["title", ""],
    ["title", "x".repeat(81)],
    ["date", "12/11/2026"],
    ["time", "8pm"],
    ["roles", ""],
  ])("refuses %s = %j", (k, v) => {
    expect(createRaidForm.safeParse({ ...ok, [k]: v }).success).toBe(false);
  });
});

describe("moveSignupForm", () => {
  it("needs a real event and member ID", () => {
    expect(
      moveSignupForm.safeParse({ eventId: "not-a-uuid", userId: "1", role: "Tank" }).success,
    ).toBe(false);
  });
});
