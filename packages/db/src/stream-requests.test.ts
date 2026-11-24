import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkStreamRequest,
  checkStreamRequests,
  readStreamRequests,
  STREAM_PANEL,
  streamPanelWords,
  streamUrl,
} from "./alerts";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  createStreamRequest,
  decideStreamRequest,
  getStreamRequests,
  listStreamRequests,
  pruneStreamRequests,
  reopenStreamRequest,
  setStreamPanelMessage,
} from "./repo/stream-requests";
import { streamRequests } from "./schema";
import { createTestDb } from "./testing";

const CH = "980000000000000001";
const STAFF = "980000000000000002";

describe("members asking for their stream", () => {
  it("needs both channels to open, and keeps the panel's standard words as none", () => {
    expect(checkStreamRequests({ requestsEnabled: true, requestAlertChannelId: CH }).ok).toBe(
      false,
    );
    expect(
      checkStreamRequests({
        requestsEnabled: true,
        requestReviewChannelId: STAFF,
        requestAlertChannelId: CH,
        requestPanelTitle: STREAM_PANEL.title,
      }),
    ).toMatchObject({ ok: true, value: { requestsEnabled: true, requestPanelTitle: null } });
    expect(streamPanelWords(readStreamRequests(null)).title).toBe(STREAM_PANEL.title);
  });

  it("reads a channel from a name or a link, for the platforms members stream on", () => {
    expect(
      checkStreamRequest({ provider: "twitch", handle: "https://www.twitch.tv/Shroud", note: "" }),
    ).toEqual({ ok: true, value: { provider: "twitch", handle: "shroud", note: null } });
    expect(checkStreamRequest({ provider: "youtube", handle: "garrisonhq" })).toMatchObject({
      value: { handle: "@garrisonhq" },
    });
    // Reddit and RSS are the server's to add, not a member's own stream.
    expect(checkStreamRequest({ provider: "reddit", handle: "valorant" }).ok).toBe(false);
    expect(checkStreamRequest({ provider: "kick", handle: "not a name!" }).ok).toBe(false);
    expect(streamUrl("kick", "xqc")).toBe("https://kick.com/xqc");
  });
});

describe("stream requests, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "980000000000000009";
  const ask = (userId: string) => ({
    guildId: G,
    userId,
    username: `u${userId.slice(-2)}`,
    provider: "twitch",
    handle: `streamer${userId.slice(-2)}`,
    note: null,
  });

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("saves the settings from the dashboard, and lets the bot keep one request per member", async () => {
    await exec("SET ROLE garrison_web");
    const settings = checkStreamRequests({
      requestsEnabled: true,
      requestReviewChannelId: STAFF,
      requestAlertChannelId: CH,
    });
    if (!settings.ok) throw new Error(settings.error);
    const r = await applySettingsChange(db, {
      guildId: G,
      module: "alerts",
      patch: { ...settings.value },
      userId: "1",
      username: "taner",
    });
    expect(r.ok).toBe(true);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    await setStreamPanelMessage(db, G, { channelId: CH, messageId: "980000000000000003" });
    expect(await getStreamRequests(db, G)).toMatchObject({
      requestsEnabled: true,
      requestPanelMessageId: "980000000000000003",
    });
    const first = await createStreamRequest(db, ask("980000000000000011"));
    expect(first?.status).toBe("waiting");
    expect(await createStreamRequest(db, ask("980000000000000011"))).toBeNull();
    if (!first) return;
    // Only one decision lands; an approval that couldn't add the alert waits again.
    const [a, b] = await Promise.all([
      decideStreamRequest(db, G, first.id, { status: "approved", decidedBy: "kel" }),
      decideStreamRequest(db, G, first.id, { status: "declined", decidedBy: "rook" }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await reopenStreamRequest(db, first.id);
    expect((await listStreamRequests(db, G)).map((x) => x.id)).toEqual([first.id]);
    await decideStreamRequest(db, G, first.id, { status: "declined", decidedBy: "kel" });
    // Once decided, the member may ask again.
    expect(await createStreamRequest(db, ask("980000000000000011"))).not.toBeNull();
    // Decided ones are deleted after the retention; waiting ones stay.
    await pruneStreamRequests(db, new Date(Date.now() + 60_000));
    expect(await listStreamRequests(db, G)).toHaveLength(1);
    await exec("RESET ROLE");
    // The dashboard reads requests and never writes them.
    await exec("SET ROLE garrison_web");
    expect(await listStreamRequests(db, G)).toHaveLength(1);
    const denied = await Promise.resolve(
      db.insert(streamRequests).values(ask("980000000000000012")),
    ).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(denied).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});
