import { searchLedger, updateLedgerSettings } from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import type { Guild, Message } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import {
  invalidateLedgerSettings,
  LEDGER_TEXT_MAX,
  onMessageDelete,
  onMessageEdit,
} from "./service.js";

const G = "610000000000000001";
const guild = {
  id: G,
  name: "Iron Vanguard",
  channels: { cache: new Map() },
} as unknown as Guild;

const message = (over: Record<string, unknown> = {}) =>
  ({
    id: "620000000000000001",
    guild,
    guildId: G,
    channelId: "630000000000000001",
    partial: false,
    author: { id: "640000000000000001", username: "rook", bot: false },
    content: "meet at 8",
    attachments: new Map([["1", { name: "plan.png" }]]),
    ...over,
  }) as unknown as Message;

describe("Ledger message text", () => {
  let ctx: BotContext;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const t = await createTestDb();
    ({ exec, close } = t);
    await exec("SET ROLE garrison_bot");
    ctx = { db: t.db, logger: createLogger("error") };
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("keeps no text, and logs no edits, until the server turns it on", async () => {
    await onMessageDelete(ctx, message());
    await onMessageEdit(ctx, message(), message({ content: "meet at 9" }));
    const events = await searchLedger(ctx.db, { guildId: G, limit: 10 });
    expect(events.map((e) => e.type)).toEqual(["message_delete"]);
    expect(events[0]?.data).toEqual({});
  });

  it("keeps deleted and edited text when it's on, capped", async () => {
    await updateLedgerSettings(ctx.db, G, {});
    await exec("RESET ROLE");
    await exec(`UPDATE ledger_settings SET keep_message_text = true WHERE guild_id = '${G}'`);
    await exec("SET ROLE garrison_bot");
    invalidateLedgerSettings(G);

    await onMessageDelete(ctx, message({ content: "x".repeat(LEDGER_TEXT_MAX + 50) }));
    await onMessageEdit(ctx, message(), message({ content: "meet at 9" }));
    // Same text (an embed loaded): nothing to log.
    await onMessageEdit(ctx, message(), message());
    // Not cached: Discord sends no text, so none is kept.
    await onMessageDelete(ctx, message({ partial: true, content: null }));

    const [uncached, edit, deleted] = await searchLedger(ctx.db, { guildId: G, limit: 3 });
    expect(uncached?.data).toEqual({});
    expect(edit?.type).toBe("message_edit");
    expect(edit?.data).toMatchObject({ before: "meet at 8", after: "meet at 9" });
    expect(deleted?.data.text).toHaveLength(LEDGER_TEXT_MAX + 1);
    expect(deleted?.data.files).toEqual(["plan.png"]);
  });
});
