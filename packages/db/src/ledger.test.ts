import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { upsertGuild } from "./repo/guilds";
import {
  getLedgerSettings,
  pruneLedger,
  recordLedgerEvent,
  searchLedger,
  updateLedgerSettings,
} from "./repo/ledger";
import { ledgerEvents } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "970";
const H = "971";

async function denied(query: PromiseLike<unknown>) {
  const err = await Promise.resolve(query).then(
    () => null,
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
  expect(err, "should be refused").toMatch(/permission denied/);
}

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
  await upsertGuild(db, { id: H, name: "Other" });
});
afterAll(() => close());

const ev = (type: string, extra: Partial<Parameters<typeof recordLedgerEvent>[1]> = {}) =>
  recordLedgerEvent(db, { guildId: G, type, summary: type, ...extra });

describe("ledger, as garrison_bot", () => {
  it("records and searches by user, type and page", async () => {
    await ev("member_join", { targetId: "kel" });
    await ev("member_ban", { actorId: "taner", targetId: "kel" });
    await ev("role_update", { actorId: "taner" });
    await recordLedgerEvent(db, {
      guildId: H,
      type: "member_join",
      targetId: "kel",
      summary: "elsewhere",
    });

    expect((await searchLedger(db, { guildId: G })).map((e) => e.type)).toEqual([
      "role_update",
      "member_ban",
      "member_join",
    ]);
    expect((await searchLedger(db, { guildId: G, userId: "kel" })).map((e) => e.type)).toEqual([
      "member_ban",
      "member_join",
    ]);
    expect(
      (await searchLedger(db, { guildId: G, userId: "taner", type: "member_ban" })).length,
    ).toBe(1);
    const [newest] = await searchLedger(db, { guildId: G, limit: 1 });
    expect((await searchLedger(db, { guildId: G, before: newest?.id })).length).toBe(2);
  });

  it("can't edit or delete events directly", async () => {
    await denied(db.update(ledgerEvents).set({ summary: "nothing happened" }));
    await denied(db.delete(ledgerEvents));
  });

  it("prunes only past retention, never newer than 7 days", async () => {
    await exec("RESET ROLE");
    // Backdate as the owner to simulate age.
    await exec(`insert into ledger_events (guild_id, type, summary, created_at) values
      ('${G}', 'old', 'old', now() - interval '40 days'),
      ('${G}', 'week', 'week', now() - interval '5 days'),
      ('${H}', 'mid', 'mid', now() - interval '20 days')`);
    await exec("SET ROLE garrison_bot");

    // A bot trying to wipe history by setting retention to 1 day is refused by the database,
    // and ledger_prune() clamps to 7 days as well.
    const refused = await updateLedgerSettings(db, H, { retentionDays: 1 }).then(
      () => "",
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(refused).toMatch(/ledger_retention_range/);
    await updateLedgerSettings(db, H, { retentionDays: 7 });
    expect((await getLedgerSettings(db, H)).retentionDays).toBe(7);
    const removed = await pruneLedger(db);
    expect(removed).toBe(2); // G's 40-day event (30-day default) and H's 20-day event
    const types = (await searchLedger(db, { guildId: G, limit: 100 })).map((e) => e.type);
    expect(types).toContain("week");
    expect(types).not.toContain("old");
  });
});
