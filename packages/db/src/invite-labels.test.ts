import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { checkInviteLabels, inviteCategories, inviteCode, readInviteLabels } from "./invite-labels";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import { getInviteLabels, inviteStats } from "./repo/invites";
import { applySettingsChange } from "./repo/settings";
import { memberFlow } from "./schema";
import { createTestDb } from "./testing";

const free = entitlements("free");
const pro = entitlements("pro");
const ROLE = "350000000000000001";
const label = (code: string, over: Record<string, unknown> = {}) => ({ code, name: code, ...over });

describe("invite labels", () => {
  it("reads invite links and bare codes", () => {
    expect(inviteCode("https://discord.gg/ironVG")).toBe("ironVG");
    expect(inviteCode("discord.com/invite/dsbrd7Kq/")).toBe("dsbrd7Kq");
    expect(inviteCode("  abc-123  ")).toBe("abc-123");
    expect(inviteCode("https://evil.example/ironVG")).toBeNull();
    expect(inviteCode("not a code!")).toBeNull();
  });

  it("checks names, colors, categories and roles", () => {
    expect(checkInviteLabels([label("ab", { name: "" })], free, []).ok).toBe(false);
    expect(checkInviteLabels([label("ab", { color: "red" })], free, []).ok).toBe(false);
    expect(checkInviteLabels([label("ab"), label("ab")], free, []).ok).toBe(false);
    expect(checkInviteLabels([label("a b")], free, []).ok).toBe(false);
    expect(
      checkInviteLabels(
        [label("ab", { name: " Disboard ", color: "#AABBCC", category: "Listings", roleId: ROLE })],
        free,
        [],
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          code: "ab",
          name: "Disboard",
          color: "#aabbcc",
          description: null,
          category: "Listings",
          roleId: ROLE,
          partner: null,
        },
      ],
    });
  });

  it("keeps partner details only in the Partners category", () => {
    const partner = { server: "Silver Pines", contact: "fern", note: "Weekly shout-outs" };
    const r = checkInviteLabels(
      [label("p1", { category: "Partners", partner }), label("p2", { category: "Ads", partner })],
      free,
      [],
    );
    expect(r).toMatchObject({ ok: true, value: [{ partner }, { partner: null }] });
  });

  it("holds Free to ten labels, and keeps what a server labelled on Pro", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => label(`code${i}`));
    expect(checkInviteLabels(eleven, free, []).ok).toBe(false);
    const saved = checkInviteLabels(eleven, pro, []);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(checkInviteLabels(eleven, free, saved.value).ok).toBe(true);
  });

  it("lists categories in use and reads stored lists leniently", () => {
    const labels = readInviteLabels([
      label("a1", { category: "Socials" }),
      label("a2", { category: "Partners", partner: { server: "" } }),
      label("a3", { category: "Socials" }),
      { code: "x y", name: "bad" },
      "junk",
    ]);
    expect(labels.map((l) => l.code)).toEqual(["a1", "a2", "a3"]);
    expect(labels[1]?.partner).toBeNull();
    expect(inviteCategories(labels)).toEqual(["Socials", "Partners"]);
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960000000000000069";
const owner = { userId: "100000000000000001", username: "owner" };

describe("invite labels and stats, in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Ironhold" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("the dashboard saves labels with history; the bot reads them and writes a plan's", async () => {
    await exec("SET ROLE garrison_web");
    const checked = checkInviteLabels([label("ironVG", { roleId: ROLE })], free, []);
    if (!checked.ok) throw new Error(checked.error);
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "invites",
        patch: { labels: checked.value },
        ...owner,
      }),
    ).toMatchObject({ ok: true });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await getInviteLabels(db, G)).toMatchObject([{ code: "ironVG", roleId: ROLE }]);
    // Since 0094 the bot writes the labels an AI assistant plan adds, with history like the
    // dashboard's.
    expect(
      await applySettingsChange(db, {
        guildId: G,
        module: "invites",
        patch: { labels: [] },
        ...owner,
      }),
    ).toMatchObject({ ok: true });
    await exec("RESET ROLE");
  });

  it("counts joins per invite, and who stayed a week", async () => {
    await exec("SET ROLE garrison_bot");
    const now = Date.now();
    const at = (days: number) => new Date(now - days * 86_400_000);
    const join = (userId: string, code: string, days: number) =>
      db
        .insert(memberFlow)
        .values({ guildId: G, userId, kind: "join", inviteCode: code, at: at(days) });
    await join("1", "ironVG", 20);
    await join("2", "ironVG", 15);
    await db.insert(memberFlow).values({ guildId: G, userId: "2", kind: "leave", at: at(14) });
    await join("3", "ironVG", 2);
    await join("4", "dsbrd7Kq", 10);
    await join("5", "ironVG", 40);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    const stats = await inviteStats(db, G, 30);
    const iron = stats.find((s) => s.code === "ironVG");
    // Three joined in the window; two of them over a week ago, and one of those stayed.
    expect(iron).toMatchObject({ joins: 3, settled: 2, stayed: 1 });
    expect(stats.find((s) => s.code === "dsbrd7Kq")).toMatchObject({ joins: 1, stayed: 1 });
    await exec("RESET ROLE");
  });
});
