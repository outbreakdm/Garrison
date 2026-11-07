import {
  listDashboardActions,
  listSignups,
  listUpcomingOps,
  queueDashboardAction,
  signUp,
  upsertGuild,
} from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import { type Client, Collection } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import { processDashboardActions } from "./actions.js";

const G = "980000000000000001";
const CH = "980000000000000002";
const SECRET = "980000000000000003";
const ADMIN = "980000000000000010";
const NOBODY = "980000000000000011";
const ADMIN2 = "980000000000000012";

type Sent = { channel: string; body: Record<string, unknown> };
const sent: Sent[] = [];

function channel(id: string, name: string, memberCanPost: boolean) {
  return {
    id,
    name,
    isSendable: () => true,
    isTextBased: () => true,
    permissionsFor: (m: { id: string }) => ({
      has: () => m.id === "garrison" || memberCanPost,
    }),
    send: async (body: Record<string, unknown>) => {
      sent.push({ channel: id, body });
      return { id: `${id}-msg-${sent.length}` };
    },
  };
}

const channels = new Collection<string, ReturnType<typeof channel>>([
  [CH, channel(CH, "raids", true)],
  [SECRET, channel(SECRET, "officers", false)],
]);
const members: Record<string, { id: string; permissions: { has: () => boolean } }> = {
  [ADMIN]: { id: ADMIN, permissions: { has: () => true } },
  [NOBODY]: { id: NOBODY, permissions: { has: () => false } },
  [ADMIN2]: { id: ADMIN2, permissions: { has: () => true } },
};
const guild = {
  id: G,
  ownerId: "someone-else",
  channels: { cache: channels },
  members: {
    me: { id: "garrison" },
    fetch: async (id: string) => {
      const m = members[id];
      if (!m) throw new Error("Unknown Member");
      return m;
    },
  },
};
const client = { guilds: { cache: new Collection([[G, guild]]) } } as unknown as Client<true>;

let ctx: BotContext;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const as = async (role: string) => {
  await exec("RESET ROLE");
  await exec(`SET ROLE ${role}`);
};
const raid = (channelId: string, title = "Molten Core") => ({
  kind: "create_raid" as const,
  payload: {
    channelId,
    title,
    when: `${new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)} 20:00`,
    roles: "Tank 2, Healer 3, DPS 5",
    note: null,
    repeatWeekly: false,
  },
});

beforeAll(async () => {
  const t = await createTestDb();
  exec = t.exec;
  close = t.close;
  ctx = { db: t.db, logger: createLogger("error") } as BotContext;
  await as("garrison_bot");
  await upsertGuild(ctx.db, { id: G, name: "Scapewatch" });
});
afterAll(() => close());

async function run(user: string, input: Parameters<typeof queueDashboardAction>[3]) {
  await as("garrison_web");
  const q = await queueDashboardAction(ctx.db, G, { id: user, name: user }, input);
  if (!q.ok) throw new Error(q.reason);
  await as("garrison_bot");
  await processDashboardActions(ctx, client);
  await as("garrison_web");
  const row = (await listDashboardActions(ctx.db, G, 50)).find((a) => a.id === q.action.id);
  await as("garrison_bot");
  return row;
}

describe("dashboard actions, run by the bot", () => {
  it("creates a raid and posts its card when the requester may", async () => {
    const row = await run(ADMIN, raid(CH));
    expect(row).toMatchObject({ status: "done", message: "Posted Molten Core in #raids." });
    expect(sent.at(-1)?.channel).toBe(CH);
    const [event] = await listUpcomingOps(ctx.db, G);
    expect(event).toMatchObject({ hostId: ADMIN, messageId: `${CH}-msg-1` });
  });

  it("refuses someone who no longer has Manage Server", async () => {
    const before = sent.length;
    const row = await run(NOBODY, raid(CH, "Onyxia"));
    expect(row).toMatchObject({ status: "failed" });
    expect(row?.message).toMatch(/Manage Server/);
    expect(sent.length).toBe(before);
  });

  it("won't post where the requester can't, or into another server's channel", async () => {
    expect(await run(ADMIN, raid(SECRET, "BWL"))).toMatchObject({ status: "failed" });
    expect(await run(ADMIN, raid("980000000000000099", "AQ40"))).toMatchObject({
      status: "failed",
    });
  });

  it("re-checks the payload, whatever the row says", async () => {
    const bad = raid(CH, "x");
    bad.payload.when = "tomorrow-ish";
    expect(await run(ADMIN, bad)).toMatchObject({ status: "failed" });
  });

  it("posts a call for signups without pinging anyone", async () => {
    const [event] = await listUpcomingOps(ctx.db, G);
    if (!event) throw new Error("no event");
    const row = await run(ADMIN, { kind: "call_signups", payload: { eventId: event.id } });
    expect(row).toMatchObject({ status: "done" });
    const last = sent.at(-1)?.body;
    expect(last?.allowedMentions).toEqual({ parse: [] });
    expect(String(last?.content)).toMatch(/2 Tank short, 3 Healer short, 5 DPS short/);
  });

  it("moves a benched player onto a role with room, and not onto a full one", async () => {
    const [event] = await listUpcomingOps(ctx.db, G);
    if (!event) throw new Error("no event");
    const P = (n: number) => `98000000000000010${n}`;
    await signUp(ctx.db, event.id, P(1), "Tank", null);
    await signUp(ctx.db, event.id, P(2), "Tank", null);
    await signUp(ctx.db, event.id, P(3), "Tank", "Prot"); // Tank full: benched
    const full = await run(ADMIN2, {
      kind: "move_signup",
      payload: { eventId: event.id, userId: P(3), role: "Tank" },
    });
    expect(full).toMatchObject({ status: "failed" });
    const moved = await run(ADMIN2, {
      kind: "move_signup",
      payload: { eventId: event.id, userId: P(3), role: "DPS" },
    });
    expect(moved).toMatchObject({ status: "done" });
    const me = (await listSignups(ctx.db, event.id)).find((x) => x.userId === P(3));
    expect(me).toMatchObject({ role: "DPS", bench: false, spec: "Prot" });
  });
});
