import type { OpsEvent, OpsSignup } from "@garrison/db";
import { describe, expect, it } from "vitest";
import type { Card } from "../../lib/card.js";
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
  style: "simple",
  teamId: null,
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
  attended: null,
  availability: null,
  characterId: null,
});

describe("opsCard", () => {
  const signups = [
    s("brannoc", "Tank", "Prot"),
    s("vhaltar", "Tank", "Bear"),
    s("seraphine", "Healer", "Priest"),
    s("dorn", "Healer", "Warrior", true),
  ];
  const texts = (card: Card) =>
    (card.blocks ?? []).flatMap((b) => (b === "divider" ? [] : [b.text]));

  it("shows the shortage, role caps with specs, open seats and the bench", () => {
    const card = opsCard(event, signups);
    expect(card.title).toBe("Molten Core");
    expect(card.status).toBe("2 open");
    const blocks = texts(card);
    expect(blocks[0]).toContain("repeats weekly · reminders 24 h and 30 min before");
    expect(blocks[1]).toBe("**Tank** 2/4\n<@brannoc> · Prot\n<@vhaltar> · Bear\n2 open");
    expect(blocks[2]).toBe("**Healer** 1/1\n<@seraphine> · Priest");
    expect(blocks[3]).toBe("**Bench** 1\n<@dorn> · Warrior (Healer)");
    expect(card.ref).toBe("3/5");
    expect(card.module).toBe("ops");
  });

  it("puts Sign up beside each role, and keeps it on a full role for the bench", () => {
    const blocks = (opsCard(event, signups).blocks ?? []).filter((b) => b !== "divider");
    const tank = blocks[1];
    const healer = blocks[2];
    expect(tank?.button?.toJSON()).toMatchObject({ label: "Sign up as Tank" });
    expect(healer?.button?.toJSON()).toMatchObject({
      label: "Sign up as Healer",
    });
    const healerButton = healer?.button?.toJSON() as { disabled?: boolean } | undefined;
    expect(healerButton?.disabled).not.toBe(true);
  });

  it("reads Ready when every role is filled, and drops buttons once canceled", () => {
    const full = [...signups, s("a", "Tank", null), s("b", "Tank", null)];
    expect(shortages(event, full)).toBeNull();
    expect(opsCard(event, full).status).toBe("Ready");
    const cancelled = opsCard({ ...event, status: "cancelled" }, full);
    expect(cancelled.status).toBe("Canceled");
    expect(cancelled.actions).toBeUndefined();
    expect(cancelled.blocks?.some((b) => b !== "divider" && b.button)).toBe(false);
  });

  it("escapes user text in specs", () => {
    expect(texts(opsCard(event, [s("x", "Tank", "**Prot**")]))[1]).toContain("\\*\\*Prot\\*\\*");
  });
});

describe("an organized raid's card", () => {
  const organized: OpsEvent = { ...event, style: "organized", teamId: null };
  const a = (userId: string, role: string, availability: string, spec: string | null = null) => ({
    ...s(userId, role, spec, availability === "cant"),
    availability,
  });

  it("asks Coming, Tentative, Late or Can't, and counts coming and late toward each role", () => {
    const card = opsCard(
      organized,
      [
        a("kel", "Tank", "coming", "Thrall · Protection Warrior"),
        a("rook", "Tank", "late"),
        a("mira", "Healer", "tentative"),
        a("ash", "", "cant"),
      ],
      ["vex"],
    );
    const text = (card.blocks ?? []).map((b) => (typeof b === "string" ? b : b.text)).join("\n");
    expect(text).toContain("**Tank** 2/4");
    expect(text).toContain("<@kel> · Thrall · Protection Warrior");
    expect(text).toContain("<@rook> · late");
    expect(text).toContain("**Healer** 0/1");
    expect(text).toContain("<@mira> · tentative");
    expect(text).toContain("**Can't** 1");
    expect(text).toContain("**No reply yet** 1");
    expect(card.status).toBe("3 short");
    expect(card.actions?.map((b) => b.toJSON())).toMatchObject([
      { label: "Coming", custom_id: `ops:avail:${event.id}:coming` },
      { label: "Tentative" },
      { label: "Late" },
      { label: "Can't" },
      { label: "Cancel raid" },
    ]);
  });
});
