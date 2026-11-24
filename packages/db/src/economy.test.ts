import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  checkEconomy,
  checkShopPanel,
  DEFAULT_ECONOMY,
  dailyAmount,
  isIcon,
  money,
  parseAmount,
  readEconomy,
  readShopPanel,
  SHOP_PANEL,
  type ShopItem,
  shopAnswers,
  shopPanelWords,
} from "./economy";
import { entitlements } from "./plans";
import {
  adjustBalance,
  buyItem,
  claimDaily,
  completePurchase,
  getEconomy,
  getShopPanel,
  getWallet,
  listLedger,
  payMember,
  refundPurchase,
  setShopPanelMessage,
  shopSold,
  topWallets,
  walletRank,
} from "./repo/economy";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const ROLE = "360000000000000001";
const CH = "360000000000000002";
const form = (over: Record<string, unknown> = {}) => ({
  ...DEFAULT_ECONOMY,
  enabled: true,
  ...over,
});
const item = (over: Partial<ShopItem> = {}): ShopItem => ({
  id: "item0001",
  name: "VIP",
  description: null,
  emoji: null,
  price: 100,
  kind: "role",
  roleId: ROLE,
  hours: null,
  stock: null,
  perMember: null,
  needsRoleId: null,
  question: null,
  ...over,
});

describe("economy rules", () => {
  it("says amounts in the server's own words", () => {
    const crowns = { name: "Crowns", singular: "Crown", icon: "👑" };
    expect(money(crowns, 1250)).toBe("👑 1,250 Crowns");
    expect(money(crowns, 1)).toBe("👑 1 Crown");
    expect(isIcon("👑")).toBe(true);
    expect(isIcon("<:gold:360000000000000003>")).toBe(true);
    expect(isIcon("gold")).toBe(false);
    expect(parseAmount("1,500")).toBe(1500);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("2.5")).toBeNull();
  });

  it("adds the streak bonus up to the streak's length", () => {
    const rules = { on: true, amount: 100, streakBonus: 10, streakDays: 7 };
    expect(dailyAmount(rules, 1)).toBe(100);
    expect(dailyAmount(rules, 3)).toBe(120);
    expect(dailyAmount(rules, 30)).toBe(160);
  });

  it("checks the currency, earning and the shop", () => {
    expect(checkEconomy(form(), free, DEFAULT_ECONOMY).ok).toBe(true);
    expect(
      checkEconomy(
        form({ currency: { name: "", singular: "x", icon: "🪙" } }),
        free,
        DEFAULT_ECONOMY,
      ).ok,
    ).toBe(false);
    expect(
      checkEconomy(
        form({ currency: { name: "Gold", singular: "Gold", icon: "gold" } }),
        free,
        DEFAULT_ECONOMY,
      ).ok,
    ).toBe(false);
    const earn = {
      ...DEFAULT_ECONOMY.earn,
      chat: { on: true, min: 5, max: 1, cooldownSeconds: 60 },
    };
    expect(checkEconomy(form({ earn }), free, DEFAULT_ECONOMY).ok).toBe(false);
    expect(checkEconomy(form({ shop: [item({ roleId: null })] }), free, DEFAULT_ECONOMY).ok).toBe(
      false,
    );
    expect(
      checkEconomy(form({ shop: [item({ kind: "staff", roleId: null })] }), free, DEFAULT_ECONOMY),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/staff channel/) });
    expect(
      checkEconomy(
        form({ shop: [item({ kind: "staff", roleId: ROLE })], staffChannelId: CH }),
        free,
        DEFAULT_ECONOMY,
      ),
    ).toMatchObject({ ok: true, value: { shop: [{ kind: "staff", roleId: null }] } });
  });

  it("keeps Pro's extras to Pro, and Free to ten items", () => {
    const voice = { ...DEFAULT_ECONOMY.earn, voice: { on: true, per10: 5 } };
    expect(checkEconomy(form({ earn: voice }), free, DEFAULT_ECONOMY).ok).toBe(false);
    expect(checkEconomy(form({ earn: voice }), pro, DEFAULT_ECONOMY).ok).toBe(true);
    expect(checkEconomy(form({ shop: [item({ hours: 24 })] }), free, DEFAULT_ECONOMY).ok).toBe(
      false,
    );
    const eleven = Array.from({ length: 11 }, (_, i) => item({ id: `item${1000 + i}` }));
    expect(checkEconomy(form({ shop: eleven }), free, DEFAULT_ECONOMY).ok).toBe(false);
    const saved = checkEconomy(form({ shop: eleven }), pro, DEFAULT_ECONOMY);
    if (!saved.ok) throw new Error(saved.error);
    expect(checkEconomy(form({ shop: eleven }), free, saved.value).ok).toBe(true);
  });

  it("lets a staff item ask one question, and needs its answer", () => {
    const ask = item({ kind: "staff", roleId: null, question: "  Which   color? " });
    const saved = checkEconomy(form({ shop: [ask], staffChannelId: CH }), free, DEFAULT_ECONOMY);
    expect(saved).toMatchObject({ ok: true, value: { shop: [{ question: "Which color?" }] } });
    // A role item never asks: buying it gives the role at once.
    expect(
      checkEconomy(form({ shop: [item({ question: "Why?" })] }), free, DEFAULT_ECONOMY),
    ).toMatchObject({ ok: true, value: { shop: [{ question: null }] } });
    expect(
      checkEconomy(
        form({
          shop: [item({ kind: "staff", roleId: null, question: "x".repeat(46) })],
          staffChannelId: CH,
        }),
        free,
        DEFAULT_ECONOMY,
      ).ok,
    ).toBe(false);
    expect(shopAnswers({ question: "Which color?" }, " ")).toMatchObject({ ok: false });
    expect(shopAnswers({ question: "Which color?" }, " Teal ")).toEqual({
      ok: true,
      value: [{ label: "Which color?", value: "Teal" }],
    });
    expect(shopAnswers({ question: null }, "ignored")).toEqual({ ok: true, value: null });
  });

  it("stores the shop panel's standard words as none", () => {
    expect(
      checkShopPanel({ shopPanelTitle: SHOP_PANEL.title, shopPanelBody: " Spend it here " }),
    ).toEqual({ ok: true, value: { shopPanelTitle: null, shopPanelBody: "Spend it here" } });
    expect(shopPanelWords(readShopPanel(null))).toEqual({
      title: SHOP_PANEL.title,
      body: SHOP_PANEL.body,
    });
  });

  it("reads stored rows leniently", () => {
    const r = readEconomy({
      enabled: true,
      shop: [item(), { id: "bad" }],
      currency: { icon: "x" },
    });
    expect(r.shop).toHaveLength(1);
    expect(r.currency.icon).toBe("🪙");
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000071";
const A = { id: "700000000000000011", username: "kestrel", name: "kestrel" };
const B = { id: "700000000000000012", username: "fern", name: "fern" };
const owner = { userId: "100000000000000001", username: "owner" };

describe("economy money, in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Ironhold" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("the dashboard saves settings with history; the bot reads them", async () => {
    await exec("SET ROLE garrison_web");
    const checked = checkEconomy(form({ shop: [item()] }), free, DEFAULT_ECONOMY);
    if (!checked.ok) throw new Error(checked.error);
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "economy",
        patch: { ...checked.value },
        ...owner,
      }),
    ).toMatchObject({ ok: true });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await getEconomy(db, G)).toMatchObject({ enabled: true, shop: [{ id: "item0001" }] });
    await exec("RESET ROLE");
  });

  it("never lets a balance go below zero", async () => {
    await exec("SET ROLE garrison_bot");
    expect(
      await adjustBalance(db, {
        guildId: G,
        userId: A.id,
        amount: 150,
        source: "give",
        reason: "event",
      }),
    ).toEqual({ ok: true, balance: 150 });
    expect(
      await adjustBalance(db, {
        guildId: G,
        userId: A.id,
        amount: -200,
        source: "take",
        reason: "x",
      }),
    ).toEqual({ ok: false, reason: "insufficient", balance: 150 });
    expect((await getWallet(db, G, A.id)).balance).toBe(150);
    await exec("RESET ROLE");
  });

  it("sums chatting into one ledger row a day", async () => {
    await exec("SET ROLE garrison_bot");
    const now = new Date("2026-11-16T10:00:00Z");
    await adjustBalance(db, { guildId: G, userId: B.id, amount: 3, source: "chat" }, now);
    await adjustBalance(
      db,
      { guildId: G, userId: B.id, amount: 4, source: "chat" },
      new Date("2026-11-16T11:00:00Z"),
    );
    const rows = (await listLedger(db, G, { userId: B.id })).filter((r) => r.source === "chat");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 7, balanceAfter: 7 });
    await exec("RESET ROLE");
  });

  it("gives the daily once a day, with a streak", async () => {
    await exec("SET ROLE garrison_bot");
    const rules = { on: true, amount: 100, streakBonus: 10, streakDays: 7 };
    const day1 = new Date("2026-11-14T12:00:00Z");
    const day2 = new Date("2026-11-15T12:00:00Z");
    expect(await claimDaily(db, G, B.id, rules, day1)).toMatchObject({
      ok: true,
      amount: 100,
      streak: 1,
    });
    expect(await claimDaily(db, G, B.id, rules, day1)).toMatchObject({ ok: false });
    expect(await claimDaily(db, G, B.id, rules, day2)).toMatchObject({
      ok: true,
      amount: 110,
      streak: 2,
    });
    expect(await claimDaily(db, G, B.id, rules, new Date("2026-11-17T12:00:00Z"))).toMatchObject({
      ok: true,
      streak: 1,
    });
    await exec("RESET ROLE");
  });

  it("pays between members within the daily cap, both ways at once", async () => {
    await exec("SET ROLE garrison_bot");
    const now = new Date("2026-11-16T12:00:00Z");
    const pay = (from: typeof A, to: typeof A, amount: number, cap = 100) =>
      payMember(db, { guildId: G, from, to, amount, dailyCap: cap }, now);
    const [x, y] = await Promise.all([pay(A, B, 50), pay(B, A, 50)]);
    expect(x.ok && y.ok).toBe(true);
    expect(await pay(A, B, 60)).toEqual({ ok: false, reason: "cap", left: 50 });
    expect(await pay(A, B, 10_000, 1_000_000)).toMatchObject({ ok: false, reason: "insufficient" });
    await exec("RESET ROLE");
  });

  it("sells the last one only once, and refunds a staff item once", async () => {
    await exec("SET ROLE garrison_bot");
    await adjustBalance(db, { guildId: G, userId: B.id, amount: 1000, source: "give" });
    const last = item({ id: "item0002", stock: 1, price: 10 });
    const [p, q] = await Promise.all([buyItem(db, G, A, last), buyItem(db, G, B, last)]);
    expect([p.ok, q.ok].filter(Boolean)).toHaveLength(1);
    const staff = item({ id: "item0003", kind: "staff", roleId: null, price: 25, perMember: 1 });
    const before = (await getWallet(db, G, B.id)).balance;
    const bought = await buyItem(db, G, B, staff, new Date(), [{ label: "Which?", value: "Teal" }]);
    expect(bought).toMatchObject({
      ok: true,
      purchase: { status: "waiting", answers: [{ label: "Which?", value: "Teal" }] },
    });
    // The panel's "left": refunds put one back.
    expect((await shopSold(db, G)).get("item0002")).toBe(1);
    expect(await buyItem(db, G, B, staff)).toEqual({ ok: false, reason: "limit" });
    if (!bought.ok) return;
    const [r1, r2] = await Promise.all([
      refundPurchase(db, G, bought.purchase.id, { id: "1", name: "mod" }),
      refundPurchase(db, G, bought.purchase.id, { id: "2", name: "mod2" }),
    ]);
    expect([r1, r2].filter(Boolean)).toHaveLength(1);
    expect((await getWallet(db, G, B.id)).balance).toBe(before);
    expect(await completePurchase(db, G, bought.purchase.id, "mod")).toBeNull();
    expect((await shopSold(db, G)).get("item0003")).toBeUndefined();
    // The bot records where it posted the shop panel.
    await setShopPanelMessage(db, G, { channelId: CH, messageId: "360000000000000009" });
    expect(await getShopPanel(db, G)).toMatchObject({
      shopPanelChannelId: CH,
      shopPanelMessageId: "360000000000000009",
    });
    await exec("RESET ROLE");
  });

  it("ranks the richest", async () => {
    await exec("SET ROLE garrison_web");
    const top = await topWallets(db, G);
    expect(top[0]?.balance).toBeGreaterThanOrEqual(top[1]?.balance ?? 0);
    expect(await walletRank(db, G, top[0]?.balance ?? 0)).toBe(1);
    await exec("RESET ROLE");
  });

  it("the dashboard can't move money", async () => {
    await exec("SET ROLE garrison_web");
    await expect(
      adjustBalance(db, { guildId: G, userId: A.id, amount: 5, source: "give" }),
    ).rejects.toThrow();
    await exec("RESET ROLE");
  });
});
