import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  ACTION_TTL_MS,
  claimDashboardActions,
  finishDashboardAction,
  listDashboardActions,
  MAX_PER_USER_PER_MINUTE,
  queueDashboardAction,
} from "./repo/actions";
import { upsertGuild } from "./repo/guilds";
import { dashboardActions } from "./schema";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "970";
const taner = { id: "1", name: "taner" };
const call = (eventId: string) => ({ kind: "call_signups" as const, payload: { eventId } });

async function refused(query: PromiseLike<unknown>) {
  return Promise.resolve(query).then(
    () => "",
    (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
  );
}
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await as("garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
  await as("garrison_web");
});
afterAll(() => close());

describe("dashboard actions outbox", () => {
  it("queues a request and limits calls for signups to one per raid per hour", async () => {
    expect(await queueDashboardAction(db, G, taner, call("e1"))).toMatchObject({ ok: true });
    expect(await queueDashboardAction(db, G, taner, call("e1"))).toEqual({
      ok: false,
      reason: "cooldown",
    });
  });

  it("limits each member to a few requests a minute", async () => {
    for (let i = 2; i <= MAX_PER_USER_PER_MINUTE; i++)
      expect(await queueDashboardAction(db, G, taner, call(`e${i}`))).toMatchObject({ ok: true });
    expect(await queueDashboardAction(db, G, taner, call("e99"))).toEqual({
      ok: false,
      reason: "too_fast",
    });
  });

  it("won't let the dashboard fake an outcome or change a request", async () => {
    const forged = await refused(
      db.insert(dashboardActions).values({
        guildId: G,
        kind: "call_signups",
        payload: {},
        requestedById: "2",
        requestedByName: "kel",
        status: "done",
      }),
    );
    expect(forged).toMatch(/row-level security/);
    expect(await refused(db.update(dashboardActions).set({ status: "done" }))).toMatch(
      /permission denied/,
    );
    expect(await refused(db.delete(dashboardActions))).toMatch(/permission denied/);
  });

  it("is claimed once by the bot, which can't add requests", async () => {
    await as("garrison_bot");
    const claimed = await claimDashboardActions(db, 3);
    expect(claimed).toHaveLength(3);
    expect(await claimDashboardActions(db, 10)).toHaveLength(2);
    const first = claimed[0];
    if (!first) throw new Error("unreachable");
    await finishDashboardAction(db, first.id, { ok: true, message: "Posted." });
    await finishDashboardAction(db, first.id, { ok: false, message: "again" }); // no effect
    expect(
      await refused(
        db.insert(dashboardActions).values({
          guildId: G,
          kind: "call_signups",
          payload: {},
          requestedById: "2",
          requestedByName: "kel",
        }),
      ),
    ).toMatch(/permission denied/);
    await as("garrison_web");
    const rows = await listDashboardActions(db, G);
    expect(rows.find((r) => r.id === first.id)).toMatchObject({
      status: "done",
      message: "Posted.",
    });
  });

  it("drops requests left too long instead of doing them late", async () => {
    await as("garrison_bot");
    const later = new Date(Date.now() + ACTION_TTL_MS + 60_000);
    expect(await claimDashboardActions(db, 10, later)).toHaveLength(0);
    await as("garrison_web");
    const rows = await listDashboardActions(db, G);
    expect(rows.filter((r) => r.status === "running")).toHaveLength(0);
    expect(rows.filter((r) => r.status === "failed").length).toBe(4);
  });
});
