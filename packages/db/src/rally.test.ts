import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  checkTemplates,
  DEFAULT_WORDING,
  newTemplateId,
  renderWording,
  TEMPLATE_PRESETS,
} from "./rally";
import { upsertGuild } from "./repo/guilds";
import { claimRallyNotify, createLfgPost, getGuildPlan, getRallyTemplates } from "./repo/rally";
import { applySettingsChange, undoSettingsChange } from "./repo/settings";
import { guildPlans, rallySettings } from "./schema";
import { createTestDb } from "./testing";

const tpl = (over: Record<string, unknown> = {}) => ({
  id: "abc123",
  name: "Mythic+",
  game: "World of Warcraft",
  roles: "Tank 1, Healer 1, DPS 3",
  size: null,
  wording: { ...DEFAULT_WORDING, group: "group", requirement: "Item level" },
  lifetimeHours: 3,
  voice: true,
  channelIds: [],
  notifyRoleId: null,
  isDefault: false,
  ...over,
});

describe("checkTemplates", () => {
  it("accepts every preset as a template", () => {
    const list = Object.values(TEMPLATE_PRESETS).map((p, i) => ({
      ...p,
      id: `preset${i}`,
      channelIds: [],
      notifyRoleId: null,
      isDefault: false,
    }));
    expect(checkTemplates(list.slice(0, 3), "free").ok).toBe(true);
    expect(checkTemplates(list, "pro").ok).toBe(true);
  });

  it("holds free servers to 3 templates and keeps role pings for Pro", () => {
    const four = [1, 2, 3, 4].map((n) => tpl({ id: `id000${n}`, name: `T${n}` }));
    expect(checkTemplates(four, "free")).toMatchObject({ ok: false, error: /Garrison Pro/ });
    expect(checkTemplates(four, "pro").ok).toBe(true);
    const ping = [tpl({ notifyRoleId: "123456789012345678" })];
    expect(checkTemplates(ping, "free")).toMatchObject({ ok: false, error: /Pro/ });
    expect(checkTemplates(ping, "pro").ok).toBe(true);
  });

  it.each([
    [{ wording: { ...DEFAULT_WORDING, full: "@everyone ready" } }],
    [{ wording: { ...DEFAULT_WORDING, full: "<@&123> ready" } }],
    [{ wording: { ...DEFAULT_WORDING, leave: "[Leave](https://evil.example)" } }],
    [{ wording: { ...DEFAULT_WORDING, join: "Join" } }], // several roles need {role}
    [{ name: "<script>" }],
    [{ roles: "Tank 50" }],
    [{ lifetimeHours: 48 }],
    [{ channelIds: ["general"] }],
  ])("refuses unsafe or invalid input %#", (over) => {
    expect(checkTemplates([tpl(over)], "pro").ok).toBe(false);
  });

  it("collapses line breaks in wording to spaces", () => {
    const r = checkTemplates(
      [tpl({ wording: { ...DEFAULT_WORDING, close: "Close\n\nnow" } })],
      "free",
    );
    expect(r.ok && r.value[0]?.wording.close).toBe("Close now");
  });

  it("refuses duplicate names and two defaults", () => {
    expect(checkTemplates([tpl(), tpl({ id: "other1" })], "free").ok).toBe(false);
    expect(
      checkTemplates(
        [tpl({ isDefault: true }), tpl({ id: "other1", name: "Raid", isDefault: true })],
        "free",
      ).ok,
    ).toBe(false);
  });

  it("fills placeholders", () => {
    const w = { ...DEFAULT_WORDING, group: "fireteam" };
    expect(renderWording("{Group}'s full", w)).toBe("Fireteam's full");
    expect(renderWording("Join as {role}", w, { role: "Titan" })).toBe("Join as Titan");
    expect(newTemplateId()).toMatch(/^[a-z0-9]{10}$/);
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "990";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const refused = (q: PromiseLike<unknown>) =>
  Promise.resolve(q).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );

describe("Rally templates in the database", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: G, name: "Scapewatch" });
  });
  afterAll(() => close());

  it("saves templates from the dashboard with history and undo; the bot only reads", async () => {
    await as("garrison_web");
    const ok = checkTemplates([tpl()], "free");
    if (!ok.ok) throw new Error(ok.error);
    const res = await applySettingsChange(db, {
      guildId: G,
      module: "rally",
      patch: { templates: ok.value },
      userId: "1",
      username: "taner",
    });
    expect(res).toMatchObject({ ok: true });
    await as("garrison_bot");
    expect(await getRallyTemplates(db, G)).toHaveLength(1);
    expect(await refused(db.update(rallySettings).set({ templates: [] }))).toMatch(
      /permission denied/,
    );
    await as("garrison_web");
    if (!res.ok) throw new Error("unreachable");
    expect(
      await undoSettingsChange(db, G, res.change.id, { userId: "2", username: "kel" }),
    ).toMatchObject({ ok: true });
    expect(await getRallyTemplates(db, G)).toHaveLength(0);
  });

  it("caps the stored list at 25 even if the app check is skipped", async () => {
    const many = Array.from({ length: 26 }, (_, i) => tpl({ id: `id${i}xxxx`, name: `T${i}` }));
    expect(await refused(db.update(rallySettings).set({ templates: many as never }))).toMatch(
      /rally_templates_list/,
    );
  });

  it("keeps plans read-only for both apps", async () => {
    expect(await getGuildPlan(db, G)).toBe("free");
    expect(await refused(db.insert(guildPlans).values({ guildId: G, plan: "pro" }))).toMatch(
      /permission denied/,
    );
    await as("garrison_bot");
    expect(await refused(db.insert(guildPlans).values({ guildId: G, plan: "pro" }))).toMatch(
      /permission denied/,
    );
    await as("postgres");
    await db.insert(guildPlans).values({ guildId: G, plan: "pro" });
    await as("garrison_bot");
    expect(await getGuildPlan(db, G)).toBe("pro");
  });

  it("notifies a template's role at most once per cooldown", async () => {
    const post = (host: string) =>
      createLfgPost(db, {
        guildId: G,
        channelId: "1",
        hostId: host,
        hostSlot: "",
        title: "Key",
        note: null,
        slots: [{ name: "", count: 5 }],
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        templateId: "abc123",
        wording: { ...DEFAULT_WORDING, voice: true },
      });
    const a = await post("10");
    const b = await post("11");
    if (!a || !b) throw new Error("no post");
    expect(await claimRallyNotify(db, G, "abc123", a.id)).toBe(true);
    expect(await claimRallyNotify(db, G, "abc123", b.id)).toBe(false);
    expect(await claimRallyNotify(db, G, "abc123", b.id, new Date(Date.now() + 16 * 60_000))).toBe(
      true,
    );
  });
});
