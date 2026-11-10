import type { ModCase } from "@garrison/db";
import { describe, expect, it } from "vitest";
import {
  caseEmbed,
  confirmationEmbed,
  confirmationEmbedForPurge,
  dmEmbed,
  undoRow,
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
      "logs",
      "qm",
      "link",
      "unlink",
      "roster",
      "dashboard",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps every command guild-only, and permission-gated unless it's meant for everyone", () => {
    const forEveryone = new Set(["lfg", "rank", "leaderboard", "link", "unlink", "roster"]);
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

describe("Watch embeds", () => {
  it("footers carry the module and case ID, never 'Powered by'", () => {
    const json = caseEmbed(baseCase).toJSON();
    expect(json.footer?.text).toBe("Watch · case #1042");
    expect(json.title).toBe("Timeout · kel");
    expect(json.color).toBe(0xffb547);
  });

  it("confirms with what happened and flags closed DMs", () => {
    const json = confirmationEmbed(baseCase, { dmSent: false }).toJSON();
    expect(json.title).toBe("Timeout applied to kel for 1 h");
    expect(json.description).toContain("their DMs are closed");
  });

  it("mentions an escalation when a warning triggers one", () => {
    const warn = { ...baseCase, action: "warn" as const, durationSeconds: null };
    const escalated = {
      ...baseCase,
      caseNumber: 1043,
      source: "escalation" as const,
      reason: "3 warnings in 24 h",
    };
    const json = confirmationEmbed(warn, { dmSent: true, escalated }).toJSON();
    expect(json.description).toContain("3 warnings in 24 h");
    expect(json.description).toContain("timeout for 1 h. See case #1043");
  });

  it("marks undone cases in green", () => {
    const json = caseEmbed({ ...baseCase, revokedAt: new Date(), revokedById: "7" }).toJSON();
    expect(json.color).toBe(0x2bd99f);
    expect(json.title).toContain("(undone)");
  });

  it("writes neutral DMs with an appeal line", () => {
    const json = dmEmbed({ action: "ban", guildName: "Scapewatch", reason: null }).toJSON();
    expect(json.title).toBe("You were banned from Scapewatch");
    expect(json.fields?.map((f) => f.name)).toEqual(["Reason", "How to appeal"]);
  });

  it("explains a short purge", () => {
    const purge = { ...baseCase, action: "purge" as const, targetId: null, targetTag: null };
    const json = confirmationEmbedForPurge(purge, {
      requested: 50,
      deleted: 1,
      channelId: "9",
    }).toJSON();
    expect(json.title).toBe("Deleted 1 message");
    expect(json.description).toContain("older than 14 days");
  });

  it("builds an undo button keyed by case number", () => {
    const button = undoRow(baseCase).toJSON().components[0];
    expect(button).toMatchObject({ custom_id: "watch:undo:1042", label: "Undo" });
  });
});
