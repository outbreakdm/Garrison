import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { entitlements } from "./plans";
import {
  checkRankCard,
  cleanRankDetails,
  DEFAULT_RANK_CARD,
  isRankImage,
  lockedRankCard,
  memberFields,
  parseRankCard,
  type RankCardField,
  type RankCardStyle,
  rankCardForPlan,
  rankDetailLines,
  readRankCard,
} from "./rank-cards";
import { upsertGuild } from "./repo/guilds";
import { getRankDetails, getRanksSettings, saveRankDetails } from "./repo/ranks";
import { applySettingsChange } from "./repo/settings";
import { rankProfiles } from "./schema";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const custom: RankCardStyle = {
  background: "dusk",
  accent: "#5ab0ff",
  fields: [{ id: "field00001", label: "Main", from: null, hint: "Holy Paladin" }],
  showLinked: true,
};

describe("rank card rules", () => {
  it("keeps the standard card free and the rest Pro", () => {
    expect(checkRankCard(DEFAULT_RANK_CARD, free, DEFAULT_RANK_CARD).ok).toBe(true);
    expect(lockedRankCard(custom, free)).toEqual([
      "Background",
      "Accent color",
      "Details on the card",
      "Linked game accounts",
    ]);
    expect(checkRankCard(custom, pro, DEFAULT_RANK_CARD).ok).toBe(true);
    // Saved on Pro, kept on Free (paused): the bot draws the standard card meanwhile.
    expect(checkRankCard(custom, free, custom).ok).toBe(true);
    expect(rankCardForPlan(custom, free)).toEqual(DEFAULT_RANK_CARD);
    expect(rankCardForPlan(custom, pro)).toEqual(custom);
  });

  it("fetches background images only from Discord", () => {
    expect(isRankImage("https://cdn.discordapp.com/attachments/1/2/bg.png")).toBe(true);
    expect(isRankImage("https://media.discordapp.net/attachments/1/2/bg.png")).toBe(true);
    expect(isRankImage("http://cdn.discordapp.com/a.png")).toBe(false);
    expect(isRankImage("https://cdn.discordapp.com.evil.example/a.png")).toBe(false);
    expect(parseRankCard({ background: "https://evil.example/a.png" }).ok).toBe(false);
  });

  it("refuses bad details and reads broken rows as the standard card", () => {
    expect(parseRankCard({ fields: [{ id: "field00001", label: "" }] }).ok).toBe(false);
    expect(
      parseRankCard({
        fields: [
          { id: "field00001", label: "Main" },
          { id: "field00002", label: "main" },
        ],
      }).ok,
    ).toBe(false);
    expect(
      parseRankCard({
        fields: Array.from({ length: 5 }, (_, i) => ({ id: `field0000${i}`, label: `F${i}` })),
      }).ok,
    ).toBe(false);
    expect(readRankCard({ background: 42 })).toEqual(DEFAULT_RANK_CARD);
    expect(
      cleanRankDetails(custom.fields, { field00001: "  Holy   Paladin ", other: "x" }),
    ).toEqual({
      field00001: "Holy Paladin",
    });
  });
});

describe("rank card storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "995";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("lets the dashboard set the look and the bot keep members' answers", async () => {
    await exec("SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "ranks",
      patch: { card: custom },
      userId: "1",
      username: "taner",
    });
    expect(r.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(readRankCard((await getRanksSettings(db, G)).card)).toEqual(custom);
    await saveRankDetails(db, G, "100000000000000001", { field00001: "Holy Paladin" });
    await saveRankDetails(db, G, "100000000000000001", { field00001: "Ret Paladin" });
    expect(await getRankDetails(db, G, "100000000000000001")).toEqual({
      field00001: "Ret Paladin",
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    // The dashboard saves a member's own answers (the action checks it's theirs), but can't delete.
    await saveRankDetails(db, G, "100000000000000002", { field00001: "Mage" });
    expect(await getRankDetails(db, G, "100000000000000002")).toEqual({ field00001: "Mage" });
    const err = await Promise.resolve(db.delete(rankProfiles)).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});

describe("details from linked accounts", () => {
  const fields: RankCardField[] = [
    { id: "field00001", label: "Main", from: null, hint: "Holy Paladin" },
    { id: "field00002", label: "Class", from: "wow:class", hint: null },
    { id: "field00003", label: "Total", from: "osrs:total", hint: null },
  ];
  const links = [
    { provider: "wow", displayName: "Lightbringer", details: { className: "Paladin", level: 80 } },
    { provider: "steam", displayName: "x", details: {} },
  ];

  it("parses a source, and drops the hint where the value isn't typed", () => {
    const parsed = parseRankCard({ ...custom, fields });
    expect(parsed.ok && parsed.value.fields.map((f) => [f.from, f.hint])).toEqual([
      [null, "Holy Paladin"],
      ["wow:class", null],
      ["osrs:total", null],
    ]);
    expect(
      parseRankCard({ ...custom, fields: [{ id: "field00004", label: "X", from: "steam:hours" }] })
        .ok,
    ).toBe(false);
    // Details saved before sources existed are typed ones.
    const old = parseRankCard({ ...custom, fields: [{ id: "field00001", label: "Main" }] });
    expect(old.ok && old.value.fields[0]).toMatchObject({ from: null, hint: null });
  });

  it("asks members only for typed details, and reads the rest from their accounts", () => {
    expect(memberFields(fields).map((f) => f.label)).toEqual(["Main"]);
    expect(rankDetailLines(fields, { field00001: "Holy" }, links)).toEqual([
      { label: "Main", value: "Holy" },
      { label: "Class", value: "Paladin" },
    ]);
  });
});
