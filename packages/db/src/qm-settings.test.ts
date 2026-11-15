import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import {
  checkQmSettings,
  type QmSettingProposal,
  type QmSettingsLookup,
  resolveQmSettingRefs,
} from "./qm-settings";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange, readSettings, undoSettingsChange } from "./repo/settings";
import type { QmSettingChange, SettingsModule } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  for (const id of ["s1", "s2", "s3"]) await upsertGuild(db, { id, name: id });
  // The bot checks and applies the AI builder's settings.
  await exec("SET ROLE garrison_bot");
});
afterAll(() => close());

const TEXT = "111111111111111111";
const VOICE = "222222222222222222";
const CATEGORY = "333333333333333333";
const MEMBERS = "444444444444444444";
const MODS = "555555555555555555";
const lookup = (created: Record<string, "text" | "voice" | "category" | "role"> = {}) =>
  ({
    channel: (id) =>
      (({ [TEXT]: "text", [VOICE]: "voice", [CATEGORY]: "category" })[id] as
        | "text"
        | "voice"
        | "category"
        | undefined) ?? null,
    role: (id) =>
      id === MEMBERS
        ? { name: "Members", status: "ok" }
        : id === MODS
          ? { name: "Mods", status: "dangerous" }
          : null,
    created: (ref) => created[ref] ?? null,
  }) satisfies QmSettingsLookup;
const free = entitlements("free");
const p = (module: string, field: string, value: unknown): QmSettingProposal => ({
  module,
  field,
  value,
});

describe("AI builder settings", () => {
  it("turns on Suggestions in a channel the same plan makes", async () => {
    const out = await checkQmSettings(
      db,
      "s1",
      [p("suggestions", "enabled", true), p("suggestions", "channelId", "Ideas")],
      lookup({ ideas: "text" }),
      free,
    );
    expect(out).toEqual({
      ok: true,
      changes: [
        { module: "suggestions", field: "enabled", from: false, to: true },
        { module: "suggestions", field: "channelId", from: null, to: "ideas" },
      ],
    });
    if (!out.ok) return;
    const ids = new Map([["ideas", "999999999999999999"]]);
    expect(out.changes.map((c) => resolveQmSettingRefs(c, ids))).toEqual([
      true,
      "999999999999999999",
    ]);
  });

  it("uses the dashboard's rules: a channel is needed, and Pro features stay Pro", async () => {
    const needs = await checkQmSettings(
      db,
      "s1",
      [p("suggestions", "enabled", true)],
      lookup(),
      free,
    );
    expect(!needs.ok && needs.errors[0]).toMatch(/Pick the channel suggestions are posted in/);
    const pro = await checkQmSettings(
      db,
      "s1",
      [p("suggestions", "anonymous", true)],
      lookup(),
      free,
    );
    expect(!pro.ok && pro.errors[0]).toMatch(/part of Garrison Pro/);
  });

  it("refuses dangerous roles, wrong channel kinds, and anything off the list", async () => {
    const out = await checkQmSettings(
      db,
      "s1",
      [
        p("automod", "exemptRoleIds", [MODS]),
        p("starboard", "channelId", VOICE),
        p("gatehouse", "antiRaidEnabled", true),
        p("watch", "appealText", "x"),
        p("welcome", "joinRoleIds", ["nope"]),
      ],
      lookup(),
      free,
    );
    expect(!out.ok && out.errors).toEqual([
      expect.stringMatching(/@Mods has moderation or admin powers/),
      expect.stringMatching(/isn't a text channel/),
      expect.stringMatching(/gatehouse settings can't be changed/),
      expect.stringMatching(/"appealText" can't be changed/),
      expect.stringMatching(/"nope" isn't in this server/),
    ]);
  });

  it("leaves out what's already set, and follows the checks' own consequences", async () => {
    const out = await checkQmSettings(
      db,
      "s1",
      [p("ranks", "enabled", true), p("ranks", "announce", "off"), p("watch", "dmMembers", true)],
      lookup(),
      free,
    );
    // Moderation already DMs members; level-ups were "same_channel".
    expect(out).toEqual({
      ok: true,
      changes: [
        { module: "ranks", field: "enabled", from: false, to: true },
        { module: "ranks", field: "announce", from: "same_channel", to: "off" },
      ],
    });
  });

  it("can apply and undo every module's changes as the bot", async () => {
    const proposals = [
      p("suggestions", "enabled", true),
      p("suggestions", "channelId", TEXT),
      p("starboard", "enabled", true),
      p("starboard", "channelId", TEXT),
      p("starboard", "threshold", 5),
      p("voice", "enabled", true),
      p("voice", "creatorChannelIds", [VOICE]),
      p("voice", "categoryId", CATEGORY),
      p("automod", "enabled", true),
      p("automod", "scamLinks", true),
      p("automod", "exemptRoleIds", [MEMBERS]),
      p("welcome", "joinEnabled", true),
      p("welcome", "joinChannelId", TEXT),
      p("welcome", "joinRoleIds", [MEMBERS]),
    ];
    const first = await checkQmSettings(db, "s2", proposals, lookup(), free);
    if (!first.ok) throw new Error(first.errors.join(" "));
    const second = await checkQmSettings(
      db,
      "s2",
      [
        p("ranks", "enabled", true),
        p("ranks", "announce", "channel"),
        p("ranks", "announceChannelId", TEXT),
        p("ledger", "channelId", TEXT),
        p("ledger", "keepMessageText", true),
        p("watch", "logChannelId", TEXT),
      ],
      lookup(),
      free,
    );
    if (!second.ok) throw new Error(second.errors.join(" "));
    const all = [...first.changes, ...second.changes];
    const modules = [...new Set(all.map((c) => c.module))];
    expect(modules).toHaveLength(8);
    const applied: string[] = [];
    for (const module of modules) {
      const patch = Object.fromEntries(
        all.filter((c) => c.module === module).map((c: QmSettingChange) => [c.field, c.to]),
      );
      const r = await applySettingsChange(db, {
        guildId: "s2",
        module: module as SettingsModule,
        patch,
        userId: "1",
        username: "owner (AI builder v1)",
      });
      if (!r.ok) throw new Error(`${module}: ${r.reason}`);
      applied.push(r.change.id);
    }
    expect(await readSettings(db, "s2", "automod")).toMatchObject({
      enabled: true,
      scamLinks: true,
      exemptRoleIds: [MEMBERS],
    });
    for (const id of applied.reverse())
      expect((await undoSettingsChange(db, "s2", id, { userId: "1", username: "owner" })).ok).toBe(
        true,
      );
    expect(await readSettings(db, "s2", "suggestions")).toMatchObject({ enabled: false });
  });

  it("caps a plan at 6 modules", async () => {
    const out = await checkQmSettings(
      db,
      "s3",
      [
        p("suggestions", "anonymous", false),
        p("starboard", "selfStar", true),
        p("voice", "userLimit", 5),
        p("automod", "invites", true),
        p("welcome", "leaveEnabled", false),
        p("ranks", "announce", "off"),
        p("ledger", "retentionDays", 60),
      ],
      lookup(),
      free,
    );
    expect(!out.ok && out.errors).toEqual([expect.stringMatching(/at most 6 modules/)]);
  });
});
