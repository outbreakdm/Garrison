import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import {
  checkQmSettings,
  type QmSettingProposal,
  type QmSettingsLookup,
  qmSettingValueText,
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
  for (const id of ["s1", "s2", "s3", "s4"]) await upsertGuild(db, { id, name: id });
  // The bot checks and applies the AI assistant's settings.
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

describe("AI assistant settings", () => {
  it("turns on Suggestions in a channel the same plan makes", async () => {
    const out = await checkQmSettings(
      db,
      "s1",
      [p("suggestions", "enabled", true), p("suggestions", "channelId", "Ideas")],
      lookup({ ideas: "text" }),
      free,
    );
    expect(out).toMatchObject({
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
        // Anti-nuke is owner-only: never the AI assistant's.
        p("gatehouse", "antiNukeEnabled", false),
        p("watch", "appealText", "x"),
        p("welcome", "joinRoleIds", ["nope"]),
      ],
      lookup(),
      free,
    );
    expect(!out.ok && out.errors).toEqual([
      expect.stringMatching(/@Mods has moderation or admin powers/),
      expect.stringMatching(/isn't a text channel/),
      expect.stringMatching(/"antiNukeEnabled" can't be changed/),
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
    expect(out).toMatchObject({
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
        username: "owner (AI assistant v1)",
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

describe("AI assistant settings for more modules", () => {
  it("checks anti-raid, the warning ladder and level rewards like their pages do", async () => {
    const ladder = [
      { warnCount: 3, windowMinutes: 1440, action: "timeout", durationSeconds: 3600 },
      { warnCount: 5, windowMinutes: 10080, action: "ban", durationSeconds: 999 },
    ];
    const ok = await checkQmSettings(
      db,
      "s1",
      [
        p("gatehouse", "raidJoinCount", 15),
        p("gatehouse", "raidResponse", "alert"),
        p("escalation", "rules", ladder),
        p("ops", "timezone", "Europe/London"),
      ],
      lookup(),
      free,
    );
    if (!ok.ok) throw new Error(ok.errors.join(" "));
    const rules = ok.changes.find((c) => c.field === "rules")?.to as {
      durationSeconds: number | null;
    }[];
    // A ban has no duration, whatever was sent.
    expect(rules.map((r) => r.durationSeconds)).toEqual([3600, null]);
    expect(ok.changes.find((c) => c.field === "timezone")?.to).toBe("Europe/London");

    const bad = await checkQmSettings(
      db,
      "s1",
      [
        p("gatehouse", "raidJoinCount", 1),
        p("escalation", "rules", [
          { warnCount: 3, windowMinutes: 7, action: "kick", durationSeconds: null },
        ]),
        p("rewards", "rewards", [{ level: 10, roleId: MODS }]),
        p("ops", "timezone", "Mars/Olympus"),
        p("gatehouse", "backupWeekly", true),
      ],
      lookup(),
      free,
    );
    expect(!bad.ok && bad.errors).toEqual([
      expect.stringMatching(/goes from 3 to 200/),
      expect.stringMatching(/window is one of/),
      expect.stringMatching(/@Mods has moderation or admin powers/),
      expect.stringMatching(/isn't a time zone/),
    ]);
  });
});

describe("AI assistant settings that add items", () => {
  const invites = {
    ...lookup({ raiders: "role", lfg: "text" }),
    invite: (c: string) => c === "abc123",
  };
  const pro = entitlements("pro");

  it("adds alerts, shop items, templates, invite labels and counters to what's saved", async () => {
    // Something already saved stays, and the change holds only what's new.
    await exec("RESET ROLE");
    await applySettingsChange(db, {
      guildId: "s4",
      module: "alerts",
      patch: {
        feeds: [
          {
            id: "feed000001",
            provider: "twitch",
            handle: "oldstreamer",
            channelId: TEXT,
            roleId: null,
            message: null,
            accent: null,
          },
        ],
      },
      userId: "1",
      username: "owner",
    });
    await exec("SET ROLE garrison_bot");
    const out = await checkQmSettings(
      db,
      "s4",
      [
        p("alerts", "feeds", [
          {
            provider: "twitch",
            handle: "https://twitch.tv/Shroud",
            channelId: TEXT,
            roleId: MEMBERS,
          },
        ]),
        p("economy", "enabled", true),
        p("economy", "currency", { name: "Crowns", singular: "Crown", icon: "👑" }),
        p("economy", "shop", [
          {
            name: "Raider",
            price: 500,
            kind: "role",
            roleId: "Raiders",
            emoji: "",
            description: null,
          },
          { name: "Custom color", price: 2000, kind: "staff", roleId: null, emoji: "🎨" },
        ]),
        p("economy", "staffChannelId", TEXT),
        p("rally", "templates", [
          {
            name: "Raid night",
            game: "Destiny 2",
            roles: null,
            size: 6,
            group: "fireteam",
            lifetimeHours: 3,
            voice: true,
            channelIds: ["lfg"],
          },
        ]),
        p("invites", "labels", [
          { code: "discord.gg/abc123", name: "Reddit", category: "Socials", roleId: null },
        ]),
        p("stats", "enabled", true),
        p("stats", "counters", [
          { kind: "members", roleId: null, template: "" },
          { kind: "role", roleId: MODS, template: "{role} online: {count}" },
        ]),
      ],
      invites,
      pro,
    );
    if (!out.ok) throw new Error(out.errors.join(" "));
    const feeds = out.changes.find((c) => c.field === "feeds");
    expect(feeds).toMatchObject({
      from: null,
      to: [{ provider: "twitch", handle: "shroud", channelId: TEXT, roleId: MEMBERS }],
    });
    // The whole list, saved one and new one, is what applying saves.
    expect(out.full.alerts?.feeds).toHaveLength(2);
    const shop = out.changes.find((c) => c.field === "shop");
    expect(shop?.to).toMatchObject([
      { name: "Raider", price: 500, kind: "role", roleId: "raiders" },
      { name: "Custom color", kind: "staff", emoji: "🎨" },
    ]);
    const ids = new Map([
      ["raiders", "777777777777777777"],
      ["lfg", "888888888888888888"],
    ]);
    expect(resolveQmSettingRefs(shop as QmSettingChange, ids)).toMatchObject([
      { roleId: "777777777777777777" },
      { roleId: null },
    ]);
    const templates = out.changes.find((c) => c.field === "templates");
    expect(templates?.to).toMatchObject([
      { name: "Raid night", size: 6, wording: { group: "fireteam" }, channelIds: ["lfg"] },
    ]);
    expect(resolveQmSettingRefs(templates as QmSettingChange, ids)).toMatchObject([
      { channelIds: ["888888888888888888"] },
    ]);
    expect(out.changes.find((c) => c.field === "labels")?.to).toMatchObject([
      { code: "abc123", name: "Reddit", category: "Socials" },
    ]);
    // Counting a staff role's members is fine: it gives nobody anything.
    expect(out.changes.find((c) => c.field === "counters")?.to).toMatchObject([
      { kind: "members", template: "Members: {count}" },
      { kind: "role", roleId: MODS },
    ]);
    const name = (id: string) => (id === TEXT ? "#general" : id === MEMBERS ? "@Members" : id);
    expect(qmSettingValueText("alerts", "feeds", feeds?.to, name)).toBe(
      "adds Twitch shroud in #general, pings @Members",
    );
    expect(qmSettingValueText("alerts", "feeds", null, name)).toBe("");
  });

  it("refuses what the pages refuse", async () => {
    const out = await checkQmSettings(
      db,
      "s4",
      [
        p("alerts", "feeds", [{ provider: "tiktok", handle: "x", channelId: TEXT, roleId: null }]),
        p("economy", "shop", [{ name: "Mod", price: 5, kind: "role", roleId: MODS }]),
        p("invites", "labels", [
          { code: "zzz999", name: "Elsewhere", category: null, roleId: null },
        ]),
      ],
      invites,
      free,
    );
    expect(!out.ok && out.errors).toEqual([
      expect.stringMatching(/twitch, kick, youtube, reddit, bluesky or rss/),
      expect.stringMatching(/@Mods has moderation or admin powers/),
      expect.stringMatching(/zzz999 isn't one of this server's invites/),
    ]);
    // The page's own check: template names are plain.
    const badName = await checkQmSettings(
      db,
      "s4",
      [p("rally", "templates", [{ name: "@everyone", roles: null, size: 5, channelIds: [] }])],
      lookup(),
      free,
    );
    expect(!badName.ok && badName.errors[0]).toMatch(/names use letters/);
    const noInvites = await checkQmSettings(
      db,
      "s4",
      [p("invites", "labels", [{ code: "abc123", name: "Reddit", category: null, roleId: null }])],
      lookup(),
      free,
    );
    expect(!noInvites.ok && noInvites.errors[0]).toMatch(/couldn't read this server's invites/);
    const tooMany = await checkQmSettings(
      db,
      "s4",
      [
        p(
          "stats",
          "counters",
          Array.from({ length: 4 }, () => ({ kind: "members" })),
        ),
      ],
      lookup(),
      free,
    );
    expect(!tooMany.ok && tooMany.errors[0]).toMatch(/counters on Free/);
  });
});
