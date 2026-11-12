import type { ModCase } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { type Card, cardMessage, cardTexts } from "../lib/card.js";
import {
  caseCard,
  confirmationCard,
  dmCard,
  purgeCard,
  undoButton,
} from "../modules/watch/embeds.js";
import { commands } from "./index.js";

describe("command definitions", () => {
  it("registers every command with a unique name", () => {
    const names = commands.map((c) => c.data.name);
    expect(names).toEqual([
      "warn",
      "timeout",
      "kick",
      "ban",
      "purge",
      "case",
      "history",
      "moderation",
      "lockdown",
      "verify",
      "security",
      "health",
      "lfg",
      "raid",
      "rank",
      "leaderboard",
      "ranks",
      "rankcard",
      "logs",
      "qm",
      "link",
      "unlink",
      "roster",
      "ticket",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps every command guild-only, and permission-gated unless it's meant for everyone", () => {
    // /ticket: the member who opened a ticket can close it; staff checks run per subcommand.
    const forEveryone = new Set([
      "lfg",
      "rank",
      "leaderboard",
      "link",
      "unlink",
      "roster",
      "ticket",
      "rankcard",
    ]);
    for (const { data } of commands) {
      expect(data.contexts).toEqual([0]);
      if (forEveryone.has(data.name)) expect(data.default_member_permissions).toBeNull();
      else expect(data.default_member_permissions).toMatch(/^\d+$/);
      expect(data.description.length).toBeLessThanOrEqual(100);
    }
  });
});

const baseCase: ModCase = {
  id: "00000000-0000-0000-0000-000000000000",
  guildId: "1",
  caseNumber: 1042,
  action: "timeout",
  source: "manual",
  targetId: "42",
  targetTag: "kel",
  moderatorId: "7",
  moderatorTag: "taner",
  reason: "Spam in #raid-chat",
  durationSeconds: 3600,
  expiresAt: null,
  details: {},
  revokedAt: null,
  revokedById: null,
  createdAt: new Date("2026-11-06T14:02:00Z"),
};

describe("Watch cards", () => {
  const texts = (card: Card) => cardTexts(cardMessage(card)).join("\n");

  it("footers carry the module, case ID and time, never 'Powered by'", () => {
    const card = caseCard(baseCase);
    expect(card.module).toBe("watch");
    expect(card.ref).toBe("case #1042");
    expect(card.title).toBe("Timeout · kel");
    expect(card.tone).toBe("caution");
    expect(texts(card)).toMatch(/-# Watch · case #1042 · <t:\d+:f>/);
  });

  it("confirms with what happened and flags closed DMs", () => {
    const card = confirmationCard(baseCase, { dmSent: false });
    expect(card.title).toBe("Timeout applied to kel for 1 h");
    expect(texts(card)).toContain("their DMs are closed");
  });

  it("puts Undo beside the reason when the action can be undone", () => {
    const out = cardTexts(cardMessage(confirmationCard(baseCase, { dmSent: true, undo: true })));
    const reason = out.findIndex((s) => s.startsWith("**Reason:**"));
    expect(out[reason + 1]).toBe("[Undo]");
  });

  it("mentions an escalation when a warning triggers one", () => {
    const warn = { ...baseCase, action: "warn" as const, durationSeconds: null };
    const escalated = {
      ...baseCase,
      caseNumber: 1043,
      source: "escalation" as const,
      reason: "3 warnings in 24 h",
    };
    const text = texts(confirmationCard(warn, { dmSent: true, escalated }));
    expect(text).toContain("3 warnings in 24 h");
    expect(text).toContain("timeout for 1 h. See case #1043");
  });

  it("marks undone cases in green", () => {
    const card = caseCard({ ...baseCase, revokedAt: new Date(), revokedById: "7" });
    expect(card.tone).toBe("go");
    expect(card.status).toBe("Undone");
  });

  it("writes neutral DMs with an appeal line", () => {
    const card = dmCard({ action: "ban", guildName: "Scapewatch", reason: null });
    expect(card.title).toBe("You were banned from Scapewatch");
    expect(texts(card)).toContain("**To appeal:**");
  });

  it("explains a short purge", () => {
    const purge = { ...baseCase, action: "purge" as const, targetId: null, targetTag: null };
    const card = purgeCard(purge, { requested: 50, deleted: 1, channelId: "9" });
    expect(card.title).toBe("Deleted 1 message");
    expect(texts(card)).toContain("older than 14 days");
  });

  it("builds an undo button keyed by case number", () => {
    expect(undoButton(baseCase).toJSON()).toMatchObject({
      custom_id: "watch:undo:1042",
      label: "Undo",
    });
  });
});
