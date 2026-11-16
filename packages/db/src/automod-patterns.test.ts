import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkAutomod,
  DEFAULT_AUTOMOD,
  PATTERN_LIMITS,
  patternProblem,
  readAutomod,
  tryPatterns,
} from "./automod";
import type { Db } from "./client";
import { entitlements } from "./plans";
import {
  getAutomod,
  getAutomodRule,
  listPatternGuilds,
  removeAutomodRule,
  saveAutomodRule,
} from "./repo/automod";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const form = (over: Record<string, unknown> = {}) => ({
  ...DEFAULT_AUTOMOD,
  enabled: true,
  action: "warn",
  ...over,
});

describe("automod patterns", () => {
  it("refuses what Discord's engine can't run, and patterns that match everything", () => {
    expect(patternProblem(String.raw`fr[e3]{2}\s*n[i1]tro`)).toBeNull();
    expect(patternProblem(String.raw`(?i)disc[o0]rd\.gift`)).toBeNull();
    // An escaped backslash then "1" is two plain characters, not a back-reference.
    expect(patternProblem(String.raw`\\1 is fine escaped`)).toBeNull();
    expect(patternProblem("foo(?=bar)")).toMatch(/look ahead or behind/);
    expect(patternProblem("(?<!x)foo")).toMatch(/look ahead or behind/);
    expect(patternProblem(String.raw`(a)\1`)).toMatch(/refer back/);
    expect(patternProblem(String.raw`(?<n>a)\k<n>`)).toMatch(/refer back/);
    expect(patternProblem(".*")).toMatch(/every message/);
    expect(patternProblem("^(.+)$")).toMatch(/every message/);
    expect(patternProblem("x".repeat(PATTERN_LIMITS.length + 1))).toMatch(/260/);
  });

  it("tries patterns like Discord: any case, Unicode, Rust's inline flags dropped", () => {
    const r = tryPatterns(["nothing", "(?i)fr[e3]{2} n[i1]tro"], [], "Get FR33 NITRO now");
    expect(r.match).toEqual({ index: 1, found: "FR33 NITRO" });
    expect(r.allowed).toBeNull();
    expect(tryPatterns(["sc[a@]m"], ["scam"], "is this a scam?").allowed).toBe("scam");
    expect(tryPatterns(["(?x) a b"], [], "hello").match).toBeNull();
    // A pattern this browser can't compile is said, not guessed.
    expect(tryPatterns(["[a-"], [], "a").untested).toEqual([0]);
  });

  it("holds Free to three patterns, Pro to Discord's ten, and checks each one", () => {
    const four = ["aa+", "bb+", "cc+", "dd+"];
    expect(checkAutomod(form({ regexPatterns: four }), free, DEFAULT_AUTOMOD)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Free servers block 3 patterns/),
    });
    expect(checkAutomod(form({ regexPatterns: four }), pro, DEFAULT_AUTOMOD)).toMatchObject({
      ok: true,
      value: { regexPatterns: four },
    });
    const eleven = Array.from({ length: 11 }, (_, i) => `x${i}y`);
    expect(checkAutomod(form({ regexPatterns: eleven }), pro, DEFAULT_AUTOMOD).ok).toBe(false);
    expect(
      checkAutomod(form({ regexPatterns: ["ok+", "a(?=b)"] }), pro, DEFAULT_AUTOMOD),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/^Pattern 2:/) });
    expect(checkAutomod(form({ regexAllow: ["x".repeat(61)] }), pro, DEFAULT_AUTOMOD).ok).toBe(
      false,
    );
  });

  it("lets a server back on Free keep the patterns it saved on Pro", () => {
    const saved = readAutomod({ regexPatterns: ["aa+", "bb+", "cc+", "dd+"] });
    expect(checkAutomod(form({ regexPatterns: saved.regexPatterns }), free, saved)).toMatchObject({
      ok: true,
    });
  });

  it("reads stored rows leniently", () => {
    expect(readAutomod({ regexPatterns: [" a+ ", "", "a+"], regexAllow: "x" })).toMatchObject({
      regexPatterns: ["a+"],
      regexAllow: [],
    });
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000067";
const owner = { userId: "100000000000000001", username: "owner" };

describe("automod patterns, in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Ironhold" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("the dashboard saves patterns with history; the bot reads them", async () => {
    await exec("SET ROLE garrison_web");
    const checked = checkAutomod(
      form({ regexPatterns: ["fr[e3]e n[i1]tro"] }),
      free,
      DEFAULT_AUTOMOD,
    );
    if (!checked.ok) throw new Error(checked.error);
    const saved = await applySettingsChange(db, {
      guildId: G,
      module: "automod",
      patch: { ...checked.value },
      ...owner,
    });
    expect(saved).toMatchObject({ ok: true });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect((await getAutomod(db, G)).regexPatterns).toEqual(["fr[e3]e n[i1]tro"]);
    expect(await listPatternGuilds(db, [G])).toEqual([G]);
    await exec("RESET ROLE");
  });

  it("the bot keeps the rule record; the dashboard only reads it", async () => {
    await exec("SET ROLE garrison_bot");
    await saveAutomodRule(db, { guildId: G, ruleId: "1", sent: "a", error: null });
    await saveAutomodRule(db, { guildId: G, ruleId: "1", sent: "b", error: "Pattern 1: bad" });
    expect(await getAutomodRule(db, G)).toMatchObject({ sent: "b", error: "Pattern 1: bad" });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect(await getAutomodRule(db, G)).toMatchObject({ ruleId: "1" });
    await expect(
      saveAutomodRule(db, { guildId: G, ruleId: "2", sent: "c", error: null }),
    ).rejects.toThrow();
    await expect(removeAutomodRule(db, G)).rejects.toThrow();
    await exec("RESET ROLE");
  });

  it("the AI assistant's role can't change patterns", async () => {
    await exec("SET ROLE garrison_bot");
    await expect(
      applySettingsChange(db, {
        guildId: G,
        module: "automod",
        patch: { regexPatterns: ["evil+"] },
        ...owner,
      }),
    ).rejects.toThrow();
    await exec("RESET ROLE");
  });
});
