import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankCard } from "./cards";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import {
  getRoleMenuPost,
  getRoleMenus,
  listRoleMenuPosts,
  recordRoleMenuPost,
} from "./repo/role-menus";
import { applySettingsChange, undoSettingsChange } from "./repo/settings";
import {
  checkRoleMenus,
  isOneEmoji,
  isPaused,
  parseRoleMenu,
  type RoleMenu,
  readRoleMenus,
  resolvePick,
} from "./role-menus";
import { roleMenuPosts, roleMenuSettings } from "./schema";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const R1 = "500000000000000001";
const R2 = "500000000000000002";
const R3 = "500000000000000003";

const menu = (over: Partial<RoleMenu> = {}): RoleMenu => ({
  id: "abc123def0",
  name: "Pings",
  card: { ...blankCard("Pick your pings"), blocks: [{ kind: "text", text: "Hi" }] },
  style: "buttons",
  options: [
    { roleId: R1, label: "Raids", emoji: "⚔️", description: null },
    { roleId: R2, label: "Events", emoji: null, description: null },
  ],
  maxPicks: null,
  requiredRoleId: null,
  placeholder: null,
  ...over,
});

describe("role menus", () => {
  it("takes one standard emoji and nothing else", () => {
    for (const ok of ["🎮", "⚔️", "🇬🇧", "1️⃣", "👍🏽", "👩‍🚀"]) expect(isOneEmoji(ok), ok).toBe(true);
    for (const bad of ["", "a", "1", "🎮🎮", "<:x:1>", ":smile:", "🎮 "])
      expect(isOneEmoji(bad), bad).toBe(false);
  });

  it("parses a menu and refuses duplicates and bad emoji", () => {
    expect(parseRoleMenu(menu())).toEqual({ ok: true, value: menu() });
    const [first] = menu().options;
    if (!first) throw new Error("menu() has options");
    const dup = menu({ options: [first, first] });
    expect(parseRoleMenu(dup)).toMatchObject({ ok: false });
    const emoji = menu({
      options: [{ roleId: R1, label: "A", emoji: "<:x:1>", description: null }],
    });
    expect(parseRoleMenu(emoji)).toMatchObject({ ok: false });
  });

  it("caps buttons at 15 and dropdowns at 25", () => {
    const options = Array.from({ length: 16 }, (_, i) => ({
      roleId: `5000000000000001${String(i).padStart(2, "0")}`,
      label: `Role ${i}`,
      emoji: null,
      description: null,
    }));
    expect(parseRoleMenu(menu({ options }))).toMatchObject({ ok: false });
    expect(parseRoleMenu(menu({ options, style: "dropdown" }))).toMatchObject({ ok: true });
  });

  it("holds Free to 3 menus and Free picks, and lets saved values through", () => {
    const four = ["aaaaaa", "bbbbbb", "cccccc", "dddddd"].map((id) => menu({ id }));
    expect(checkRoleMenus(four, free)).toMatchObject({ ok: false });
    expect(checkRoleMenus(four, pro)).toMatchObject({ ok: true });
    // A server back on Free can still edit its four menus, but not add a fifth.
    expect(checkRoleMenus(four, free, four)).toMatchObject({ ok: true });
    expect(checkRoleMenus([...four, menu({ id: "eeeeee" })], free, four)).toMatchObject({
      ok: false,
    });
    expect(isPaused(3, free)).toBe(true);
    expect(isPaused(3, pro)).toBe(false);

    const upTo2 = menu({ maxPicks: 2 });
    expect(checkRoleMenus([upTo2], free)).toMatchObject({ ok: false });
    expect(checkRoleMenus([menu({ maxPicks: 1 })], free)).toMatchObject({ ok: true });
    expect(checkRoleMenus([upTo2], free, [upTo2])).toMatchObject({ ok: true });
    expect(checkRoleMenus([menu({ requiredRoleId: R3 })], free)).toMatchObject({ ok: false });
    expect(checkRoleMenus([menu({ requiredRoleId: R3 })], pro)).toMatchObject({ ok: true });
  });

  it("skips stored menus that no longer parse", () => {
    expect(readRoleMenus([menu(), { id: "x" }, null])).toEqual([menu()]);
    expect(readRoleMenus("nope")).toEqual([]);
  });

  it("works out what a pick changes", () => {
    const any = menu();
    expect(resolvePick(any, [], { toggle: R1 })).toEqual({ ok: true, add: [R1], remove: [] });
    expect(resolvePick(any, [R1], { toggle: R1 })).toEqual({ ok: true, add: [], remove: [R1] });
    expect(resolvePick(any, [], { toggle: R3 })).toEqual({ ok: false, reason: "not_in_menu" });
    // Just one: picking another swaps.
    const one = menu({ maxPicks: 1 });
    expect(resolvePick(one, [R1, R3], { toggle: R2 })).toEqual({
      ok: true,
      add: [R2],
      remove: [R1],
    });
    const upTo1of3 = menu({
      maxPicks: 2,
      options: [...any.options, { roleId: R3, label: "C", emoji: null, description: null }],
    });
    expect(resolvePick(upTo1of3, [R1, R2], { toggle: R3 })).toEqual({
      ok: false,
      reason: "too_many",
    });
    // A dropdown sets the whole list; roles from outside the menu are left alone.
    expect(resolvePick(any, [R1, "999"], { set: [R2] })).toEqual({
      ok: true,
      add: [R2],
      remove: [R1],
    });
    expect(resolvePick(menu({ maxPicks: 1 }), [], { set: [R1, R2] })).toEqual({
      ok: false,
      reason: "too_many",
    });
  });
});

describe("role menu storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "960";
  const who = { userId: "1", username: "taner" };

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Scapewatch" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  async function denied(query: PromiseLike<unknown>) {
    const err = await Promise.resolve(query).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err, "should be refused").toMatch(/permission denied/);
  }

  it("lets the dashboard save menus with history and undo", async () => {
    await exec("SET ROLE garrison_web");
    const saved = await applySettingsChange(db, {
      guildId: G,
      module: "roles",
      patch: { menus: [menu()] },
      ...who,
    });
    expect(saved.ok).toBe(true);
    expect(readRoleMenus(await getRoleMenus(db, G))).toEqual([menu()]);
    if (!saved.ok) return;
    const undone = await undoSettingsChange(db, G, saved.change.id, who);
    expect(undone.ok).toBe(true);
    expect(await getRoleMenus(db, G)).toEqual([]);
    await applySettingsChange(db, {
      guildId: G,
      module: "roles",
      patch: { menus: [menu()] },
      ...who,
    });
    await denied(
      db
        .insert(roleMenuPosts)
        .values({ guildId: G, menuId: "abc123def0", channelId: "1", messageId: "2" }),
    );
    await exec("RESET ROLE");
  });

  it("lets the bot read menus and record posts, but never edit menus", async () => {
    await exec("SET ROLE garrison_bot");
    expect(readRoleMenus(await getRoleMenus(db, G))).toHaveLength(1);
    await recordRoleMenuPost(db, {
      guildId: G,
      menuId: "abc123def0",
      channelId: "1",
      messageId: "2",
    });
    await recordRoleMenuPost(db, {
      guildId: G,
      menuId: "abc123def0",
      channelId: "1",
      messageId: "3",
    });
    expect((await getRoleMenuPost(db, G, "abc123def0"))?.messageId).toBe("3");
    expect(await listRoleMenuPosts(db, G)).toHaveLength(1);
    await denied(db.update(roleMenuSettings).set({ menus: [] }));
    await exec("RESET ROLE");
  });
});
