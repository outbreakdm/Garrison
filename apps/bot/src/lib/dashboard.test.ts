import type { Db, ModCase } from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import type { ChatInputCommandInteraction, InteractionReplyOptions } from "discord.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { commandsByName } from "../commands/index.js";
import type { BotContext } from "../commands/types.js";
import { caseRow } from "../modules/watch/embeds.js";
import { dashboardBase, NO_DASHBOARD, serverUrl, settingsReply } from "./dashboard.js";
import { createLogger } from "./logger.js";

const G = "111111111111111111";
const APP = "https://dash.garrison.test";

describe("dashboard links", () => {
  it("uses APP_URL, without a trailing slash", () => {
    expect(dashboardBase({ APP_URL: `${APP}/` })).toBe(APP);
    expect(dashboardBase({ APP_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("leaves links out when APP_URL is unset, invalid or the example placeholder", () => {
    for (const APP_URL of [
      undefined,
      "",
      "dash.garrison.test",
      "https://dash.example.com",
      "javascript:alert(1)",
    ])
      expect(dashboardBase({ APP_URL })).toBeNull();
  });

  it("builds server pages with paths, queries and anchors", () => {
    const env = { APP_URL: APP };
    expect(serverUrl(G, "", env)).toBe(`${APP}/servers/${G}`);
    expect(serverUrl(G, "watch?edit=settings#settings", env)).toBe(
      `${APP}/servers/${G}/watch?edit=settings#settings`,
    );
    expect(serverUrl(G, "#health", env)).toBe(`${APP}/servers/${G}#health`);
    expect(serverUrl("../admin", "", env)).toBeNull();
  });

  it("explains a settings command, with a link button when it can", () => {
    const withLink = settingsReply({
      subject: "Watch settings are",
      url: `${APP}/x`,
      label: "Change Watch settings",
    });
    expect(withLink.content).toBe(
      "Watch settings are changed on the dashboard now, where every change is kept in history and can be undone.",
    );
    expect(JSON.parse(JSON.stringify(withLink.components))[0].components[0]).toMatchObject({
      style: 5,
      url: `${APP}/x`,
      label: "Change Watch settings",
    });
    const without = settingsReply({ subject: "Watch settings are", url: null, label: "x" });
    expect(without.content).toContain(NO_DASHBOARD);
    expect(without.components).toEqual([]);
  });
});

describe("case buttons", () => {
  afterEach(() => vi.unstubAllEnvs());
  const c: Pick<ModCase, "caseNumber" | "guildId" | "targetId" | "action" | "revokedAt"> = {
    caseNumber: 7,
    guildId: G,
    targetId: "222222222222222222",
    action: "timeout",
    revokedAt: null,
  };
  const buttons = (row: ReturnType<typeof caseRow>) =>
    row
      ?.toJSON()
      .components.map((b) =>
        "url" in b
          ? `link ${b.url}`
          : `${"label" in b ? b.label : ""}${b.disabled ? " (off)" : ""}`,
      ) ?? null;

  it("puts Undo and a link to the member's page under a case", () => {
    vi.stubEnv("APP_URL", APP);
    expect(buttons(caseRow(c))).toEqual([
      "Undo",
      `link ${APP}/servers/${G}/watch/member/222222222222222222`,
    ]);
    expect(buttons(caseRow({ ...c, action: "kick" }))).toEqual([
      `link ${APP}/servers/${G}/watch/member/222222222222222222`,
    ]);
    expect(buttons(caseRow(c, { undone: true }))?.[0]).toBe("Undone (off)");
  });

  it("has no row for a kick when there's no dashboard", () => {
    vi.stubEnv("APP_URL", "");
    expect(caseRow({ ...c, action: "kick" })).toBeNull();
    expect(buttons(caseRow(c))).toEqual(["Undo"]);
  });
});

describe("settings commands only show settings", () => {
  const SETTINGS = ["moderation", "security", "verify", "ranks"];
  const optionsOf = (name: string) =>
    (commandsByName.get(name)?.data.options ?? []) as {
      name: string;
      type: number;
      options?: unknown[];
    }[];

  it("take no options, so nothing can be changed from Discord", () => {
    for (const name of SETTINGS)
      for (const o of optionsOf(name)) {
        expect(o.type, `${name} ${o.name}`).toBe(1); // subcommands only
        expect(o.options ?? [], `${name} ${o.name}`).toEqual([]);
      }
    const sub = (cmd: string, name: string) => optionsOf(cmd).find((o) => o.name === name);
    expect(sub("logs", "settings")?.options ?? []).toEqual([]);
    expect(sub("raid", "timezone")?.options ?? []).toEqual([]);
  });

  it("keeps the subcommands people know", () => {
    expect(optionsOf("verify").map((o) => o.name)).toEqual(["setup", "off"]);
    expect(optionsOf("ranks").map((o) => o.name)).toEqual([
      "settings",
      "reward",
      "unreward",
      "rewards",
    ]);
  });
});

describe("replies in Discord", () => {
  let db: Db;
  let close: () => Promise<void>;
  let ctx: BotContext;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    ctx = { db, logger: createLogger("error") };
  });
  afterAll(() => close());
  afterEach(() => vi.unstubAllEnvs());

  /** Run a command and return what it replied. */
  async function run(name: string, sub: string | null = null) {
    let reply: InteractionReplyOptions | undefined;
    const interaction = {
      guild: { id: G, name: "Iron Wardens" },
      options: { getSubcommand: () => sub },
      reply: async (r: InteractionReplyOptions) => {
        reply = r;
      },
    } as unknown as ChatInputCommandInteraction<"cached">;
    await commandsByName.get(name)?.execute(interaction, ctx);
    const json = JSON.parse(JSON.stringify(reply ?? {}));
    return {
      content: String(json.content ?? ""),
      title: json.embeds?.[0]?.title as string | undefined,
      link: json.components?.[0]?.components?.find((b: { url?: string }) => b.url)?.url as
        | string
        | undefined,
      ephemeral: Boolean(Number(json.flags ?? 0) & 64),
    };
  }

  it("/dashboard links to the server", async () => {
    vi.stubEnv("APP_URL", APP);
    const r = await run("dashboard");
    expect(r).toMatchObject({ link: `${APP}/servers/${G}`, ephemeral: true });
    expect(r.content).toContain("Iron Wardens");
    vi.stubEnv("APP_URL", "");
    expect((await run("dashboard")).content).toBe(NO_DASHBOARD);
  });

  it("each settings command shows its settings and links to the page that changes them", async () => {
    vi.stubEnv("APP_URL", APP);
    const page = (p: string) => `${APP}/servers/${G}/${p}`;
    expect(await run("moderation")).toMatchObject({
      title: "Watch settings",
      link: page("watch?edit=settings#settings"),
      ephemeral: true,
    });
    expect(await run("security")).toMatchObject({
      title: "Security settings",
      link: page("gatehouse"),
    });
    expect(await run("verify", "setup")).toMatchObject({
      title: "Verification",
      link: page("gatehouse?edit=verification#verification"),
    });
    expect(await run("logs", "settings")).toMatchObject({
      title: "Ledger settings",
      link: page("ledger?edit=settings#settings"),
    });
    expect(await run("ranks", "settings")).toMatchObject({
      title: "Ranks settings",
      link: page("ranks?edit=settings#settings"),
    });
    expect(await run("ranks", "reward")).toMatchObject({
      title: "Level rewards",
      link: page("ranks?edit=rewards#rewards"),
    });
    const tz = await run("raid", "timezone");
    expect(tz.link).toBe(page("settings#server"));
    expect(tz.content).toMatch(/^Raids use UTC unless a raid says otherwise\./);
  });
});
