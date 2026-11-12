import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankCard } from "./cards";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import { getWelcome } from "./repo/welcome";
import { welcomeSettings } from "./schema";
import { createTestDb } from "./testing";
import { checkWelcome, DEFAULT_WELCOME, fillWelcome, readWelcome } from "./welcome";

const free = entitlements("free");
const pro = entitlements("pro");
const C = "300000000000000001";
const R = ["500000000000000001", "500000000000000002"];

describe("welcome rules", () => {
  it("fills placeholders, mentioning only through {user}", () => {
    const card = fillWelcome(
      {
        ...blankCard("Welcome to {server}"),
        blocks: [{ kind: "text", text: "Hi {user} ({name}), #{count}" }],
      },
      { userId: "700000000000000001", name: "Brakk", server: "Iron Vanguard", count: 1284 },
    );
    expect(card.title).toBe("Welcome to Iron Vanguard");
    expect(card.blocks[0]).toEqual({
      kind: "text",
      text: "Hi <@700000000000000001> (Brakk), #1,284",
    });
  });

  it("needs a channel when a card is on, and keeps the DM and extra roles for Pro", () => {
    expect(checkWelcome({ joinEnabled: true }, free, DEFAULT_WELCOME)).toMatchObject({ ok: false });
    expect(
      checkWelcome({ joinEnabled: true, joinChannelId: C }, free, DEFAULT_WELCOME),
    ).toMatchObject({
      ok: true,
    });
    expect(checkWelcome({ dmEnabled: true }, free, DEFAULT_WELCOME)).toMatchObject({ ok: false });
    expect(checkWelcome({ dmEnabled: true }, pro, DEFAULT_WELCOME)).toMatchObject({ ok: true });
    expect(checkWelcome({ joinRoleIds: R }, free, DEFAULT_WELCOME)).toMatchObject({ ok: false });
    expect(checkWelcome({ joinRoleIds: R }, pro, DEFAULT_WELCOME)).toMatchObject({ ok: true });
    // Saved before a downgrade: still editable, nothing lost.
    const saved = { ...DEFAULT_WELCOME, joinRoleIds: R, dmEnabled: true };
    expect(checkWelcome({ joinRoleIds: R, dmEnabled: true }, free, saved)).toMatchObject({
      ok: true,
    });
    expect(
      checkWelcome({ joinCard: { ...blankCard("x"), accent: "#ff0000" } }, free, saved),
    ).toMatchObject({
      ok: false,
    });
  });

  it("keeps the welcome image for Pro, from a preset or Discord only", () => {
    const free = entitlements("free");
    const pro = entitlements("pro");
    expect(checkWelcome({ joinImage: "frost" }, free, DEFAULT_WELCOME).ok).toBe(false);
    expect(checkWelcome({ joinImage: "frost" }, pro, DEFAULT_WELCOME)).toMatchObject({
      ok: true,
      value: { joinImage: "frost" },
    });
    expect(checkWelcome({ joinImage: "https://evil.example/a.png" }, pro, DEFAULT_WELCOME).ok).toBe(
      false,
    );
    expect(
      checkWelcome({ joinImage: null }, free, { ...DEFAULT_WELCOME, joinImage: "frost" }),
    ).toMatchObject({
      ok: true,
      value: { joinImage: null },
    });
  });

  it("falls back to defaults for anything stored that doesn't parse", () => {
    expect(readWelcome(null)).toEqual(DEFAULT_WELCOME);
    expect(readWelcome({ joinCard: { nope: 1 }, joinRoleIds: ["x", R[0]] })).toEqual({
      ...DEFAULT_WELCOME,
      joinRoleIds: [R[0]],
    });
  });
});

describe("welcome storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "970";

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("lets the dashboard save with history, and the bot only read", async () => {
    await exec("SET ROLE garrison_web");
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "welcome",
      patch: { joinEnabled: true, joinChannelId: C, joinRoleIds: [R[0]] },
      userId: "1",
      username: "taner",
    });
    expect(r.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    const w = await getWelcome(db, G);
    expect(w).toMatchObject({ joinEnabled: true, joinChannelId: C, joinRoleIds: [R[0]] });
    expect(w.joinCard).toEqual(DEFAULT_WELCOME.joinCard);
    const err = await Promise.resolve(db.update(welcomeSettings).set({ joinEnabled: false })).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});
