import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { createTestDb } from "../testing";
import { upsertGuild } from "./guilds";
import { pruneOperations } from "./metrics";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "200000000000000073";
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const refused = (q: PromiseLike<unknown>) =>
  Promise.resolve(q).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
const count = async (query: string) => {
  const r = (await db.execute(sql.raw(query))) as unknown as
    | { n: number }[]
    | { rows: { n: number }[] };
  const rows = Array.isArray(r) ? r : r.rows;
  return Number(rows[0]?.n);
};

describe("operations_prune (migration 0073)", () => {
  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: G, name: "Prune" });
    await as("postgres");
    // Old and new requests; an old one still pending or running must survive.
    await exec(`
      INSERT INTO dashboard_actions (guild_id, kind, payload, requested_by_id, requested_by_name, status, created_at) VALUES
        ('${G}', 'call_signups', '{}', '1', 'a', 'done',    now() - interval '40 days'),
        ('${G}', 'call_signups', '{}', '1', 'a', 'failed',  now() - interval '31 days'),
        ('${G}', 'call_signups', '{}', '1', 'a', 'pending', now() - interval '40 days'),
        ('${G}', 'call_signups', '{}', '1', 'a', 'running', now() - interval '40 days'),
        ('${G}', 'call_signups', '{}', '1', 'a', 'done',    now() - interval '29 days'),
        ('${G}', 'call_signups', '{}', '1', 'a', 'done',    now())`);
    await exec(`
      INSERT INTO command_latency_hourly (hour, guild_id, count, p50_ms, p95_ms) VALUES
        (date_trunc('hour', now() - interval '100 days'), '', 1, 10, 10),
        (date_trunc('hour', now() - interval '89 days'), '', 1, 10, 10),
        (date_trunc('hour', now()), '${G}', 1, 10, 10)`);
  });
  afterAll(async () => close());

  it("removes only what is past keeping, and the bot can't delete anything itself", async () => {
    await as("garrison_bot");
    expect(await refused(exec("DELETE FROM dashboard_actions"))).toMatch(/permission denied/);
    expect(await refused(exec("DELETE FROM command_latency_hourly"))).toMatch(/permission denied/);
    // Two finished requests past 30 days, one reply-time hour past 90.
    expect(await pruneOperations(db)).toBe(3);
    expect(await pruneOperations(db)).toBe(0);

    await as("postgres");
    expect(await count("SELECT count(*)::int AS n FROM dashboard_actions")).toBe(4);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM dashboard_actions WHERE status IN ('pending', 'running')",
      ),
    ).toBe(2);
    expect(await count("SELECT count(*)::int AS n FROM command_latency_hourly")).toBe(2);
  });
});
