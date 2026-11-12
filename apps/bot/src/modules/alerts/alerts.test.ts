import {
  type AlertFeed,
  applySettingsChange,
  entitlements,
  listAlertState,
  upsertGuild,
} from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import type { Client, Guild } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { cardTexts } from "../../lib/card.js";
import { createLogger } from "../../lib/logger.js";
import { parseYoutubeFeed } from "./providers.js";
import { alertMessage, sweepAlerts } from "./service.js";

const CH = "300000000000000001";
const ROLE = "400000000000000001";
const feed = (over: Partial<AlertFeed> = {}): AlertFeed => ({
  id: "feed000001",
  provider: "youtube",
  handle: "UCaaaaaaaaaaaaaaaaaaaaaa",
  channelId: CH,
  roleId: null,
  message: null,
  accent: null,
  ...over,
});

const entry = (id: string, title: string, published: Date) => `<entry>
  <id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId>
  <title>${title}</title>
  <author><name>Iron &amp; Ash</name></author>
  <published>${published.toISOString()}</published>
</entry>`;
const xml = (...entries: string[]) =>
  `<?xml version="1.0"?><feed><title>Iron &amp; Ash</title><author><name>Iron &amp; Ash</name></author>${entries.join("")}</feed>`;

describe("alert messages", () => {
  it("reads a channel's feed, newest first, with entities decoded", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const videos = parseYoutubeFeed(
      xml(entry("bbbbbbbbbbb", "Part 2 &lt;live&gt;", now), entry("aaaaaaaaaaa", "Part 1", now)),
    );
    expect(videos.map((v) => [v.id, v.title, v.author])).toEqual([
      ["bbbbbbbbbbb", "Part 2 <live>", "Iron & Ash"],
      ["aaaaaaaaaaa", "Part 1", "Iron & Ash"],
    ]);
  });

  it("pings only the chosen role, and makes the provider's text inert", () => {
    const m = alertMessage(feed({ roleId: ROLE, provider: "twitch" }), entitlements("free"), {
      id: "1",
      name: "rook",
      title: "@everyone [free](https://evil.example)",
      game: "Valheim",
      url: "https://www.twitch.tv/rook",
      thumbnail: "",
    });
    expect(m.allowedMentions).toEqual({ parse: [], roles: [ROLE] });
    const text = cardTexts(m).join("\n");
    expect(text).toContain(`<@&${ROLE}>`);
    expect(text).toContain("rook is live on Twitch");
    expect(text).not.toContain("@everyone [free]");
  });

  it("uses a Pro message on Pro and the standard words on Free", () => {
    const custom = feed({ message: "New one: {title}" });
    const item = {
      id: "v",
      name: "n",
      title: "Raid guide",
      game: "",
      url: "https://y",
      thumbnail: "",
    };
    expect(cardTexts(alertMessage(custom, entitlements("pro"), item)).join("\n")).toContain(
      "New one: Raid guide",
    );
    expect(cardTexts(alertMessage(custom, entitlements("free"), item)).join("\n")).toContain(
      "**Raid guide**",
    );
  });
});

describe("alert sweep", () => {
  let ctx: BotContext;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "650000000000000001";
  const sent: unknown[] = [];
  const guild = {
    id: G,
    name: "Iron Vanguard",
    members: { me: { id: "bot" } },
    channels: {
      cache: new Map([
        [
          CH,
          {
            isSendable: () => true,
            permissionsFor: () => ({ has: () => true }),
            send: async (m: unknown) => {
              sent.push(m);
            },
          },
        ],
      ]),
    },
  } as unknown as Guild;
  const client = { guilds: { cache: new Map([[G, guild]]) } } as unknown as Client<true>;
  let feedXml = "";
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const t = await createTestDb();
    ({ exec, close } = t);
    ctx = { db: t.db, logger: createLogger("error") };
    await exec("SET ROLE garrison_bot");
    await upsertGuild(t.db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    await applySettingsChange(t.db, {
      guildId: G,
      module: "alerts",
      patch: { feeds: [feed(), feed({ id: "feed000002", provider: "twitch", handle: "rook" })] },
      userId: "1",
      username: "taner",
    });
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    globalThis.fetch = (async () => new Response(feedXml, { status: 200 })) as typeof fetch;
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await exec("RESET ROLE");
    await close();
  });

  it("records the newest video first, then posts each new one once", async () => {
    const now = Date.now();
    feedXml = xml(entry("aaaaaaaaaaa", "Old", new Date(now - 3_600_000)));
    await sweepAlerts(ctx, client, { twitch: null }, now);
    expect(sent).toHaveLength(0);
    const state = await listAlertState(ctx.db, G);
    expect(state.find((s) => s.feedId === "feed000001")?.lastItemId).toBe("aaaaaaaaaaa");
    // Twitch without keys says so, for the dashboard.
    expect(state.find((s) => s.feedId === "feed000002")?.problem).toBe("not_configured");

    feedXml = xml(
      entry("ccccccccccc", "Newest", new Date(now)),
      entry("bbbbbbbbbbb", "New", new Date(now - 60_000)),
      entry("aaaaaaaaaaa", "Old", new Date(now - 3_600_000)),
    );
    await sweepAlerts(ctx, client, { twitch: null }, now + 10 * 60_000);
    expect(sent).toHaveLength(2);
    expect(cardTexts(sent[0] as { components: { toJSON(): unknown }[] }).join(" ")).toContain(
      "New",
    );
    // The same feed again posts nothing.
    await sweepAlerts(ctx, client, { twitch: null }, now + 20 * 60_000);
    expect(sent).toHaveLength(2);
  });
});
