/**
 * Economy (docs/ECONOMY.md): a server currency with its own name and icon. Members earn it by
 * chatting, a daily claim, time in voice and level-ups, pay each other within a daily cap, and
 * spend it in a shop of roles and staff-handled items. Every change is on a ledger. No
 * gambling and nothing that touches real money. Pure and shared.
 *
 * Free: 10 shop items; chatting, daily, paying and staff grants. Pro: 50 items, voice and
 * level-up earning, and timed roles.
 */

import { PANEL_LIMITS, panelText, readPanelText } from "./panels";
import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";
import type { VerifyAnswer } from "./verify-questions";

export interface Currency {
  /** Plural, as in "1,250 Crowns". */
  name: string;
  /** As in "1 Crown". */
  singular: string;
  /** A Unicode emoji, or a server emoji as <:name:id>. */
  icon: string;
}

export interface EarnRules {
  chat: { on: boolean; min: number; max: number; cooldownSeconds: number };
  daily: { on: boolean; amount: number; streakBonus: number; streakDays: number };
  /** Pro: for every 10 minutes in voice with someone else. */
  voice: { on: boolean; per10: number };
  /** Pro: at each level reached. */
  level: { on: boolean; perLevel: number };
  /** Members paying each other, up to a daily cap each. */
  pay: { on: boolean; dailyCap: number };
}

export type ShopKind = "role" | "staff";

export interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  price: number;
  kind: ShopKind;
  /** For "role": the role it gives. */
  roleId: string | null;
  /** Pro, for "role": taken back after this many hours. Null: kept. */
  hours: number | null;
  /** How many can ever be bought. Null: no limit. */
  stock: number | null;
  /** How many one member can buy. Null: no limit. */
  perMember: number | null;
  /** Only members with this role can buy it. */
  needsRoleId: string | null;
  /**
   * A staff-handled item can ask one thing before it's bought ("Which color?"); the answer
   * goes to staff with the purchase. Null: nothing to ask.
   */
  question: string | null;
}

export interface EconomyConfig {
  enabled: boolean;
  currency: Currency;
  earn: EarnRules;
  shop: ShopItem[];
  /** Where staff-handled purchases go. */
  staffChannelId: string | null;
  /** Channels where chatting earns nothing. */
  noEarnChannelIds: string[];
}

export const ECONOMY_LIMITS = {
  items: 50,
  name: 40,
  description: 200,
  currencyName: 24,
  icon: 64,
  price: 1_000_000_000,
  amount: 1_000_000,
  chat: 1_000,
  cooldown: 3_600,
  daily: 1_000_000,
  streakDays: 30,
  hours: 24 * 30,
  stock: 1_000_000,
  reason: 200,
  noEarn: 50,
  /** What Discord's form shows of a question. */
  question: 45,
  answer: 300,
} as const;

export const DEFAULT_CURRENCY: Currency = { name: "Coins", singular: "Coin", icon: "🪙" };

export const DEFAULT_EARN: EarnRules = {
  chat: { on: true, min: 1, max: 5, cooldownSeconds: 60 },
  daily: { on: true, amount: 100, streakBonus: 10, streakDays: 7 },
  voice: { on: false, per10: 5 },
  level: { on: false, perLevel: 50 },
  pay: { on: true, dailyCap: 5_000 },
};

export const DEFAULT_ECONOMY: EconomyConfig = {
  enabled: false,
  currency: DEFAULT_CURRENCY,
  earn: DEFAULT_EARN,
  shop: [],
  staffChannelId: null,
  noEarnChannelIds: [],
};

const SNOWFLAKE = /^\d{17,20}$/;
const ID = /^[a-z0-9]{6,16}$/;
/** A server emoji as Discord writes it, or a short run of Unicode emoji. */
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;
const UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️){1,16}$/u;

export const isIcon = (v: string) => CUSTOM_EMOJI.test(v) || UNICODE_EMOJI.test(v);

export function newItemId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function readCurrency(raw: unknown): Currency {
  const c = obj(raw);
  const icon = typeof c.icon === "string" && isIcon(c.icon.trim()) ? c.icon.trim() : null;
  return {
    name: text(c.name, ECONOMY_LIMITS.currencyName) ?? DEFAULT_CURRENCY.name,
    singular: text(c.singular, ECONOMY_LIMITS.currencyName) ?? DEFAULT_CURRENCY.singular,
    icon: icon ?? DEFAULT_CURRENCY.icon,
  };
}

function readEarn(raw: unknown): EarnRules {
  const e = obj(raw);
  const chat = obj(e.chat);
  const daily = obj(e.daily);
  const voice = obj(e.voice);
  const level = obj(e.level);
  const pay = obj(e.pay);
  const d = DEFAULT_EARN;
  const min = int(chat.min, 0, ECONOMY_LIMITS.chat, d.chat.min);
  return {
    chat: {
      on: chat.on === undefined ? d.chat.on : chat.on === true,
      min,
      max: Math.max(min, int(chat.max, 0, ECONOMY_LIMITS.chat, d.chat.max)),
      cooldownSeconds: int(chat.cooldownSeconds, 10, ECONOMY_LIMITS.cooldown, 60),
    },
    daily: {
      on: daily.on === undefined ? d.daily.on : daily.on === true,
      amount: int(daily.amount, 0, ECONOMY_LIMITS.daily, d.daily.amount),
      streakBonus: int(daily.streakBonus, 0, ECONOMY_LIMITS.daily, d.daily.streakBonus),
      streakDays: int(daily.streakDays, 1, ECONOMY_LIMITS.streakDays, d.daily.streakDays),
    },
    voice: {
      on: voice.on === true,
      per10: int(voice.per10, 0, ECONOMY_LIMITS.chat, d.voice.per10),
    },
    level: {
      on: level.on === true,
      perLevel: int(level.perLevel, 0, ECONOMY_LIMITS.amount, d.level.perLevel),
    },
    pay: {
      on: pay.on === undefined ? d.pay.on : pay.on === true,
      dailyCap: int(pay.dailyCap, 0, ECONOMY_LIMITS.amount, d.pay.dailyCap),
    },
  };
}

function readItem(raw: unknown): ShopItem | null {
  const i = obj(raw);
  if (typeof i.id !== "string" || !ID.test(i.id)) return null;
  const name = text(i.name, ECONOMY_LIMITS.name);
  const price = int(i.price, 1, ECONOMY_LIMITS.price, 0);
  const kind: ShopKind = i.kind === "role" ? "role" : "staff";
  const roleId = typeof i.roleId === "string" && SNOWFLAKE.test(i.roleId) ? i.roleId : null;
  if (!name || !price || (kind === "role" && !roleId)) return null;
  const emoji = typeof i.emoji === "string" && isIcon(i.emoji.trim()) ? i.emoji.trim() : null;
  const opt = (v: unknown, max: number) =>
    v === null || v === undefined ? null : int(v, 1, max, 0) || null;
  return {
    id: i.id,
    name,
    description: text(i.description, ECONOMY_LIMITS.description),
    emoji,
    price,
    kind,
    roleId: kind === "role" ? roleId : null,
    hours: kind === "role" ? opt(i.hours, ECONOMY_LIMITS.hours) : null,
    stock: opt(i.stock, ECONOMY_LIMITS.stock),
    perMember: opt(i.perMember, ECONOMY_LIMITS.stock),
    needsRoleId:
      typeof i.needsRoleId === "string" && SNOWFLAKE.test(i.needsRoleId) ? i.needsRoleId : null,
    question: kind === "staff" ? text(i.question, ECONOMY_LIMITS.question) : null,
  };
}

/** A stored row, read leniently: an item that no longer makes sense is left out. */
export function readEconomy(
  raw: Partial<Record<keyof EconomyConfig, unknown>> | null,
): EconomyConfig {
  if (!raw) return { ...DEFAULT_ECONOMY, shop: [], noEarnChannelIds: [] };
  return {
    enabled: raw.enabled === true,
    currency: readCurrency(raw.currency),
    earn: readEarn(raw.earn),
    shop: Array.isArray(raw.shop)
      ? raw.shop
          .map(readItem)
          .filter((i): i is ShopItem => i !== null)
          .slice(0, ECONOMY_LIMITS.items)
      : [],
    staffChannelId:
      typeof raw.staffChannelId === "string" && SNOWFLAKE.test(raw.staffChannelId)
        ? raw.staffChannelId
        : null,
    noEarnChannelIds: Array.isArray(raw.noEarnChannelIds)
      ? raw.noEarnChannelIds
          .filter((v): v is string => typeof v === "string" && SNOWFLAKE.test(v))
          .slice(0, ECONOMY_LIMITS.noEarn)
      : [],
  };
}

/**
 * Check a change from the dashboard. `before` is what's saved: a server back on Free keeps
 * what it set up on Pro (the bot pauses it), but adds nothing past the Free limits.
 */
export function checkEconomy(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: EconomyConfig,
): Parsed<EconomyConfig> {
  const c = obj(raw.currency);
  const name = typeof c.name === "string" ? c.name.trim() : "";
  const singular = typeof c.singular === "string" ? c.singular.trim() : "";
  const icon = typeof c.icon === "string" ? c.icon.trim() : "";
  if (!name || !singular) return { ok: false, error: "Name the currency (one and many)." };
  if (name.length > ECONOMY_LIMITS.currencyName || singular.length > ECONOMY_LIMITS.currencyName)
    return {
      ok: false,
      error: `Currency names hold ${ECONOMY_LIMITS.currencyName} characters.`,
    };
  if (!icon || !isIcon(icon))
    return { ok: false, error: "Pick an emoji for the currency, or one of the server's." };

  const e = obj(raw.earn);
  const num = (v: unknown, min: number, max: number, label: string): number | string => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max
      ? n
      : `${label} goes from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}.`;
  };
  const chat = obj(e.chat);
  const daily = obj(e.daily);
  const voice = obj(e.voice);
  const level = obj(e.level);
  const pay = obj(e.pay);
  const values = {
    chatMin: num(chat.min, 0, ECONOMY_LIMITS.chat, "Coins per message (least)"),
    chatMax: num(chat.max, 0, ECONOMY_LIMITS.chat, "Coins per message (most)"),
    cooldown: num(chat.cooldownSeconds, 10, ECONOMY_LIMITS.cooldown, "The chat cooldown"),
    daily: num(daily.amount, 0, ECONOMY_LIMITS.daily, "The daily amount"),
    bonus: num(daily.streakBonus, 0, ECONOMY_LIMITS.daily, "The streak bonus"),
    streakDays: num(daily.streakDays, 1, ECONOMY_LIMITS.streakDays, "The streak length"),
    per10: num(voice.per10, 0, ECONOMY_LIMITS.chat, "Coins for voice"),
    perLevel: num(level.perLevel, 0, ECONOMY_LIMITS.amount, "Coins per level"),
    cap: num(pay.dailyCap, 0, ECONOMY_LIMITS.amount, "The daily paying cap"),
  };
  for (const v of Object.values(values)) if (typeof v === "string") return { ok: false, error: v };
  const n = values as Record<keyof typeof values, number>;
  if (n.chatMax < n.chatMin)
    return { ok: false, error: "The most per message can't be less than the least." };
  const voiceOn = voice.on === true;
  const levelOn = level.on === true;
  if (voiceOn && !ent["economy.extras"] && !before.earn.voice.on)
    return { ok: false, error: "Earning in voice is part of Garrison Pro." };
  if (levelOn && !ent["economy.extras"] && !before.earn.level.on)
    return { ok: false, error: "Earning at level-ups is part of Garrison Pro." };

  const list = Array.isArray(raw.shop) ? raw.shop : [];
  if (list.length > ECONOMY_LIMITS.items)
    return { ok: false, error: `Up to ${ECONOMY_LIMITS.items} shop items.` };
  const max = ent["economy.items"];
  if (list.length > max && list.length > before.shop.length)
    return {
      ok: false,
      error: `Free shops hold ${max} items. Garrison Pro holds up to ${ECONOMY_LIMITS.items}.`,
    };
  const shop: ShopItem[] = [];
  const ids = new Set<string>();
  for (const [index, item] of list.entries()) {
    const i = obj(item);
    const label = typeof i.name === "string" && i.name.trim() ? i.name.trim() : `Item ${index + 1}`;
    if (typeof i.name !== "string" || !i.name.trim())
      return { ok: false, error: `${label} needs a name.` };
    if (label.length > ECONOMY_LIMITS.name)
      return { ok: false, error: `Item names hold ${ECONOMY_LIMITS.name} characters.` };
    const price = Number(i.price);
    if (!Number.isInteger(price) || price < 1 || price > ECONOMY_LIMITS.price)
      return { ok: false, error: `${label}: the price goes from 1 to a billion.` };
    const kind: ShopKind = i.kind === "role" ? "role" : "staff";
    const roleId = typeof i.roleId === "string" && i.roleId ? i.roleId : null;
    if (kind === "role" && !(roleId && SNOWFLAKE.test(roleId)))
      return { ok: false, error: `${label}: pick the role it gives.` };
    const description = typeof i.description === "string" ? i.description.trim() : "";
    if (description.length > ECONOMY_LIMITS.description)
      return {
        ok: false,
        error: `${label}: descriptions hold ${ECONOMY_LIMITS.description} characters.`,
      };
    const emoji = typeof i.emoji === "string" && i.emoji.trim() ? i.emoji.trim() : null;
    if (emoji && !isIcon(emoji)) return { ok: false, error: `${label}: pick an emoji.` };
    const optional = (v: unknown, top: number, what: string): number | null | string => {
      if (v === null || v === undefined || v === "") return null;
      const x = Number(v);
      return Number.isInteger(x) && x >= 1 && x <= top
        ? x
        : `${label}: ${what} goes from 1 to ${top.toLocaleString("en-US")}.`;
    };
    const hours = kind === "role" ? optional(i.hours, ECONOMY_LIMITS.hours, "the time") : null;
    const stock = optional(i.stock, ECONOMY_LIMITS.stock, "the stock");
    const perMember = optional(i.perMember, ECONOMY_LIMITS.stock, "the limit per member");
    for (const v of [hours, stock, perMember])
      if (typeof v === "string") return { ok: false, error: v };
    const was = before.shop.find((x) => x.id === i.id);
    if (hours && !ent["economy.extras"] && was?.hours !== hours)
      return { ok: false, error: "Roles for a time are part of Garrison Pro." };
    const needsRoleId = typeof i.needsRoleId === "string" && i.needsRoleId ? i.needsRoleId : null;
    if (needsRoleId && !SNOWFLAKE.test(needsRoleId))
      return { ok: false, error: `${label}: pick the role needed from this server's list.` };
    const question =
      kind === "staff" && typeof i.question === "string"
        ? i.question.replace(/\s+/g, " ").trim()
        : "";
    if (question.length > ECONOMY_LIMITS.question)
      return {
        ok: false,
        error: `${label}: Discord's form shows ${ECONOMY_LIMITS.question} characters of a question.`,
      };
    let id = typeof i.id === "string" && ID.test(i.id) ? i.id : newItemId();
    while (ids.has(id)) id = newItemId();
    ids.add(id);
    shop.push({
      id,
      name: label,
      description: description || null,
      emoji,
      price,
      kind,
      roleId: kind === "role" ? roleId : null,
      hours: hours as number | null,
      stock: stock as number | null,
      perMember: perMember as number | null,
      needsRoleId,
      question: question || null,
    });
  }
  const staffChannelId =
    typeof raw.staffChannelId === "string" && raw.staffChannelId ? raw.staffChannelId : null;
  if (staffChannelId && !SNOWFLAKE.test(staffChannelId))
    return { ok: false, error: "Pick the staff channel from this server's list." };
  if (shop.some((i) => i.kind === "staff") && !staffChannelId)
    return { ok: false, error: "Pick the staff channel that hand-delivered items go to." };
  const noEarn = Array.isArray(raw.noEarnChannelIds)
    ? [...new Set(raw.noEarnChannelIds.map(String))].filter(Boolean)
    : [];
  if (noEarn.length > ECONOMY_LIMITS.noEarn || !noEarn.every((id) => SNOWFLAKE.test(id)))
    return { ok: false, error: "Pick up to 50 channels from this server's list." };
  return {
    ok: true,
    value: {
      enabled: raw.enabled === true,
      currency: { name, singular, icon },
      earn: {
        chat: {
          on: chat.on === true,
          min: n.chatMin,
          max: n.chatMax,
          cooldownSeconds: n.cooldown,
        },
        daily: {
          on: daily.on === true,
          amount: n.daily,
          streakBonus: n.bonus,
          streakDays: n.streakDays,
        },
        voice: { on: voiceOn, per10: n.per10 },
        level: { on: levelOn, perLevel: n.perLevel },
        pay: { on: pay.on === true, dailyCap: n.cap },
      },
      shop,
      staffChannelId,
      noEarnChannelIds: noEarn,
    },
  };
}

/** 1250 → "1,250", the same in every server. */
export const coinNumber = (n: number) =>
  String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "🪙 1,250 Coins", "🪙 1 Coin". */
export function money(currency: Currency, amount: number): string {
  const word = Math.abs(amount) === 1 ? currency.singular : currency.name;
  return `${currency.icon} ${coinNumber(amount)} ${word}`;
}

/** Today's daily claim for a streak: the base plus the bonus for each day past the first. */
export function dailyAmount(rules: EarnRules["daily"], streak: number): number {
  const extra = Math.min(Math.max(streak, 1), rules.streakDays) - 1;
  return rules.amount + extra * rules.streakBonus;
}

/** A whole amount someone typed, within limits, or null. */
export function parseAmount(v: unknown, max = ECONOMY_LIMITS.amount): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[,\s_]/g, "")) : Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

/**
 * What a member answered before buying, checked against the item's question: needed when it
 * asks one, cut to one line's worth of the answer limit. Labelled for the staff card.
 */
export function shopAnswers(
  item: Pick<ShopItem, "question">,
  answer: unknown,
): Parsed<VerifyAnswer[] | null> {
  if (!item.question) return { ok: true, value: null };
  const value = typeof answer === "string" ? answer.trim() : "";
  if (!value) return { ok: false, error: `Answer “${item.question}” to buy it.` };
  if (value.length > ECONOMY_LIMITS.answer)
    return { ok: false, error: `Keep the answer under ${ECONOMY_LIMITS.answer} characters.` };
  return { ok: true, value: [{ label: item.question, value }] };
}

// --- The shop panel --------------------------------------------------------------------------

/**
 * The shop panel: a card in a channel listing the shop, with a "Buy…" dropdown. Picking an
 * item shows its price and the member's balance with a Buy button, or opens its question.
 * Garrison updates it in place after each purchase, so stock stays right.
 */
export interface ShopPanelConfig {
  /** Null is the standard text (SHOP_PANEL). */
  shopPanelTitle: string | null;
  shopPanelBody: string | null;
  /** Where Garrison posted it. */
  shopPanelChannelId: string | null;
  shopPanelMessageId: string | null;
}

export const SHOP_PANEL = {
  title: "Shop",
  body: "Pick something from the list. You'll see the price and your balance before anything is spent.",
  pick: "Buy something…",
} as const;

/** Items Discord's dropdown holds. */
export const SHOP_PANEL_ITEMS = 25;

export function readShopPanel(
  raw: Partial<Record<keyof ShopPanelConfig, unknown>> | null | undefined,
): ShopPanelConfig {
  const snowflake = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  return {
    shopPanelTitle: readPanelText(raw?.shopPanelTitle, PANEL_LIMITS.title),
    shopPanelBody: readPanelText(raw?.shopPanelBody, PANEL_LIMITS.body),
    shopPanelChannelId: snowflake(raw?.shopPanelChannelId),
    shopPanelMessageId: snowflake(raw?.shopPanelMessageId),
  };
}

/** Check the panel's words. Text the same as the standard is stored as none. */
export function checkShopPanel(
  raw: Record<string, unknown>,
): Parsed<Pick<ShopPanelConfig, "shopPanelTitle" | "shopPanelBody">> {
  const title = panelText(
    raw.shopPanelTitle,
    PANEL_LIMITS.title,
    "The panel's title",
    SHOP_PANEL.title,
  );
  if (!title.ok) return title;
  const body = panelText(raw.shopPanelBody, PANEL_LIMITS.body, "The panel's text", SHOP_PANEL.body);
  if (!body.ok) return body;
  return { ok: true, value: { shopPanelTitle: title.value, shopPanelBody: body.value } };
}

/** The panel as members see it, with the standard words where the server wrote none. */
export const shopPanelWords = (c: Pick<ShopPanelConfig, "shopPanelTitle" | "shopPanelBody">) => ({
  title: c.shopPanelTitle ?? SHOP_PANEL.title,
  body: c.shopPanelBody ?? SHOP_PANEL.body,
});
