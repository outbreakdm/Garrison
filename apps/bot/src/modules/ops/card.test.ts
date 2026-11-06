import type { OpsEvent, OpsSignup } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { opsCard, shortages } from "./card.js";

const event: OpsEvent = {
  id: "22222222-2222-2222-2222-222222222222",
  seriesId: "33333333-3333-3333-3333-333333333333",
  guildId: "g",
  channelId: "c",
  messageId: "m",
  hostId: "taner",
  title: "Molten Core",
  note: null,
  slots: [
    { name: "Tank", count: 4 },
    { name: "Healer", count: 1 },
  ],
  startsAt: new Date("2026-11-13T02:00:00Z"),
  timezone: "America/Chicago",
  repeatWeekly: true,
  status: "scheduled",
  reminded24hAt: null,
  reminded30mAt: null,
  createdAt: new Date(),
};
const s = (userId: string, role: string, spec: string | null, bench = false): OpsSignup => ({
  eventId: event.id,
  userId,
  role,
  spec,
  bench,
  signedUpAt: new Date(),
  leftAt: null,
});

describe("opsCard", () => {
  const signups = [
    s("brannoc", "Tank", "Prot"),
    s("vhaltar", "Tank", "Bear"),
    s("seraphine", "Healer", "Priest"),
    s("dorn", "Healer", "Warrior", true),
  ];

  it("shows the shortage badge, role caps with specs, and the bench", () => {
    const json = opsCard(event, signups).embeds[0]?.toJSON();
    expect(json?.title).toBe("Molten Core · 2 Tank short");
    expect(json?.fields?.map((f) => f.name)).toEqual(["Tank · 2/4", "Healer · 1/1", "Bench · 1"]);
    expect(json?.fields?.[0]?.value).toBe("<@brannoc> · Prot\n<@vhaltar> · Bear\nOpen\nOpen");
    expect(json?.fields?.[2]?.value).toBe("<@dorn> · Warrior (Healer)");
    expect(json?.description).toContain("repeats weekly · reminders 24 h and 30 min before");
    expect(json?.footer?.text).toBe("Ops · 3/5");
  });

  it("reads Ready when every role is filled, and drops buttons once cancelled", () => {
    const full = [...signups, s("a", "Tank", null), s("b", "Tank", null)];
    expect(shortages(event, full)).toBeNull();
    expect(opsCard(event, full).embeds[0]?.toJSON().title).toBe("Molten Core · Ready");
    const cancelled = opsCard({ ...event, status: "cancelled" }, full);
    expect(cancelled.embeds[0]?.toJSON().title).toBe("Molten Core · Cancelled");
    expect(cancelled.components).toEqual([]);
  });

  it("escapes user text in specs", () => {
    const json = opsCard(event, [s("x", "Tank", "**Prot**")]).embeds[0]?.toJSON();
    expect(json?.fields?.[0]?.value).toContain("\\*\\*Prot\\*\\*");
  });
});
