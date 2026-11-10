import {
  createLfgPost,
  createQmPlan,
  getGatehouseSettings,
  getLfgPost,
  getQmBuild,
  listActiveMembers,
  listDashboardActions,
  listSignups,
  listUpcomingOps,
  queueDashboardAction,
  signUp,
  upsertGuild,
} from "@garrison/db";
import { createTestDb } from "@garrison/db/testing";
import { type Client, Collection, PermissionFlagsBits } from "discord.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BotContext } from "../../commands/types.js";
import { createLogger } from "../../lib/logger.js";
import { plainOutcome, processDashboardActions } from "./actions.js";

const G = "980000000000000001";
const CH = "980000000000000002";
const SECRET = "980000000000000003";
const ADMIN = "980000000000000010";
const NOBODY = "980000000000000011";
const ADMIN2 = "980000000000000012";
const OWNER = "980000000000000013";
/** Has Manage Server and nothing else. */
const MANAGER_ONLY = "980000000000000014";

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
const members: Record<string, { id: string; permissions: { has: (p?: unknown) => boolean } }> = {
  [ADMIN]: { id: ADMIN, permissions: { has: () => true } },
  [NOBODY]: { id: NOBODY, permissions: { has: () => false } },
  [ADMIN2]: { id: ADMIN2, permissions: { has: () => true } },
  [OWNER]: { id: OWNER, permissions: { has: () => true } },
  [MANAGER_ONLY]: {
    id: MANAGER_ONLY,
    permissions: { has: (p) => p === PermissionFlagsBits.ManageGuild },
  },
};
const guild = {
  id: G,
  ownerId: OWNER,
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
// Each test starts with a clean slate for the per-member rate limit (5 requests a minute).
beforeEach(async () => {
  await exec("RESET ROLE");
  await exec("UPDATE dashboard_actions SET created_at = created_at - interval '2 minutes'");
  await as("garrison_bot");
});

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
    const embed = JSON.parse(JSON.stringify(last?.embeds))[0];
    expect(embed.title).toBe("Molten Core still needs players");
    expect(embed.description).toMatch(/Needs 2 Tank, 3 Healer, 5 DPS\./);
    expect(embed.color).toBeUndefined();
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

  it("lets only the server owner change anti-nuke, within its limits", async () => {
    const settings = { enabled: false, trustedIds: [ADMIN], deleteThreshold: 4, banThreshold: 6 };
    const admin = await run(ADMIN2, { kind: "anti_nuke", payload: settings });
    expect(admin).toMatchObject({
      status: "failed",
      message: "Only the server owner can change anti-nuke.",
    });
    expect((await getGatehouseSettings(ctx.db, G)).antiNukeEnabled).toBe(true);
    const owner = await run(OWNER, { kind: "anti_nuke", payload: settings });
    expect(owner).toMatchObject({ status: "done" });
    expect(await getGatehouseSettings(ctx.db, G)).toMatchObject({
      antiNukeEnabled: false,
      antiNukeTrustedIds: [ADMIN],
      nukeDeleteThreshold: 4,
      nukeBanThreshold: 6,
    });
    const tooHigh = await run(OWNER, {
      kind: "anti_nuke",
      payload: { ...settings, deleteThreshold: 999 },
    });
    expect(tooHigh).toMatchObject({ status: "failed" });
  });

  it("closes a group from the dashboard, once", async () => {
    const post = await createLfgPost(ctx.db, {
      guildId: G,
      channelId: CH,
      hostId: "980000000000000020",
      hostSlot: "",
      title: "Key",
      note: null,
      slots: [{ name: "", count: 5 }],
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    if (!post) throw new Error("no post");
    expect(await run(OWNER, { kind: "close_lfg", payload: { id: post.id } })).toMatchObject({
      status: "done",
    });
    expect((await getLfgPost(ctx.db, G, post.id))?.status).toBe("closed");
    expect(await run(OWNER, { kind: "close_lfg", payload: { id: post.id } })).toMatchObject({
      status: "failed",
      message: "That group is already closed.",
    });
  });

  it("signs the requester up for a raid and withdraws them", async () => {
    const [event] = await listUpcomingOps(ctx.db, G);
    if (!event) throw new Error("no event");
    const up = await run(OWNER, {
      kind: "raid_signup",
      payload: { eventId: event.id, role: "Healer", spec: "Resto" },
    });
    expect(up).toMatchObject({
      status: "done",
      message: "You're signed up for Molten Core as Healer.",
    });
    expect((await listSignups(ctx.db, event.id)).find((s) => s.userId === OWNER)).toMatchObject({
      role: "Healer",
      spec: "Resto",
      bench: false,
    });
    const bad = await run(OWNER, {
      kind: "raid_signup",
      payload: { eventId: event.id, role: "Bard", spec: null },
    });
    expect(bad).toMatchObject({ status: "failed", message: "That role isn't in this raid." });
    const out = await run(OWNER, { kind: "raid_withdraw", payload: { eventId: event.id } });
    expect(out).toMatchObject({ status: "done" });
    expect((await listSignups(ctx.db, event.id)).some((s) => s.userId === OWNER)).toBe(false);
    const again = await run(OWNER, { kind: "raid_withdraw", payload: { eventId: event.id } });
    expect(again).toMatchObject({ status: "failed", message: "You're not signed up." });
  });

  it("holds a moderator to the permission the action needs", async () => {
    const row = await run(MANAGER_ONLY, {
      kind: "mod_action",
      payload: {
        action: "kick",
        userId: NOBODY,
        reason: null,
        durationSeconds: null,
        deleteMessageSeconds: 0,
      },
    });
    expect(row).toMatchObject({
      status: "failed",
      message: "You need Kick Members in Discord to do that.",
    });
    const noLength = await run(ADMIN, {
      kind: "mod_action",
      payload: {
        action: "timeout",
        userId: NOBODY,
        reason: null,
        durationSeconds: null,
        deleteMessageSeconds: 0,
      },
    });
    expect(noLength).toMatchObject({ status: "failed", message: "Pick how long to time out." });
  });

  it("only clears messages for someone who could in that channel", async () => {
    const row = await run(ADMIN, {
      kind: "purge",
      payload: { channelId: SECRET, amount: 10, userId: null, reason: null },
    });
    expect(row).toMatchObject({ status: "failed" });
    const elsewhere = await run(ADMIN, {
      kind: "purge",
      payload: { channelId: "980000000000000099", amount: 10, userId: null, reason: null },
    });
    expect(elsewhere).toMatchObject({ status: "failed" });
  });

  it("plans nothing without a planner, and lets only the asker build a plan", async () => {
    const none = await run(ADMIN, { kind: "qm_plan", payload: { request: "A raid section" } });
    expect(none).toMatchObject({ status: "failed" });
    expect(none?.message).toMatch(/isn't set up/);

    const build = await createQmPlan(ctx.db, {
      guildId: G,
      requestedById: ADMIN,
      requestedByTag: "admin",
      prompt: "A raid section",
      summary: "Raid section",
      plan: [],
      model: "test",
    });
    const other = await run(ADMIN2, { kind: "qm_apply", payload: { id: build.id } });
    expect(other).toMatchObject({
      status: "failed",
      message: "Only the person who asked for this plan can apply it.",
    });
    expect((await getQmBuild(ctx.db, G, build.id))?.status).toBe("pending");

    const discard = await run(ADMIN2, { kind: "qm_cancel", payload: { id: build.id } });
    expect(discard).toMatchObject({ status: "done" });
    expect((await getQmBuild(ctx.db, G, build.id))?.status).toBe("cancelled");
    const late = await run(ADMIN, { kind: "qm_apply", payload: { id: build.id } });
    expect(late).toMatchObject({ status: "failed" });
  });

  it("joins and leaves a group as the requester", async () => {
    const post = await createLfgPost(ctx.db, {
      guildId: G,
      channelId: CH,
      hostId: "980000000000000021",
      hostSlot: "DPS",
      title: "Duos",
      note: null,
      slots: [
        { name: "DPS", count: 1 },
        { name: "Support", count: 2 },
      ],
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    if (!post) throw new Error("no post");
    const full = await run(OWNER, { kind: "lfg_join", payload: { id: post.id, role: "DPS" } });
    expect(full).toMatchObject({ status: "failed" });
    const join = await run(OWNER, { kind: "lfg_join", payload: { id: post.id, role: "Support" } });
    expect(join).toMatchObject({ status: "done", message: "You're in Duos as Support." });
    expect((await listActiveMembers(ctx.db, post.id)).map((m) => m.userId)).toContain(OWNER);
    const leave = await run(OWNER, { kind: "lfg_leave", payload: { id: post.id } });
    expect(leave).toMatchObject({ status: "done", message: "You left Duos." });
  });

  it("writes outcomes as plain text", () => {
    expect(plainOutcome("<@123456789012345678> isn't here; <@&5> and <#6>")).toBe(
      "that member isn't here; a role and a channel",
    );
  });
});
