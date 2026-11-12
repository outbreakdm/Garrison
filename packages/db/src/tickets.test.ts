import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankCard } from "./cards";
import type { Db } from "./client";
import { entitlements } from "./plans";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange } from "./repo/settings";
import {
  addTicketNote,
  claimTicket,
  closeTicket,
  countOpenTickets,
  editTicketMessage,
  getTicketConfig,
  listOpenTicketChannels,
  listTicketMessages,
  listTickets,
  markTicketMessageDeleted,
  nextTicketNumber,
  openTicket,
  pruneTickets,
  recordTicketEvent,
  recordTicketMessage,
  ticketQueueCounts,
} from "./repo/tickets";
import { ticketMessages, tickets } from "./schema";
import { createTestDb } from "./testing";
import {
  activeQuestions,
  checkTicketOptions,
  checkTicketPanels,
  expiresAt,
  readTicketConfig,
  type TicketPanel,
  ticketChannelName,
  waitingOn,
} from "./tickets";

const free = entitlements("free");
const pro = entitlements("pro");

const topic = (id: string, questions: string[] = []) => ({
  id,
  label: `Topic ${id}`,
  emoji: null,
  questions,
});
const panel = (over: Partial<TicketPanel> = {}): TicketPanel => ({
  id: "panel00001",
  name: "Support",
  card: blankCard("Need a hand?"),
  topics: [topic("topic00001")],
  ...over,
});

describe("ticket rules", () => {
  it("holds Free to one panel of three topics, without forms", () => {
    expect(checkTicketPanels([panel()], free).ok).toBe(true);
    expect(checkTicketPanels([panel(), panel({ id: "panel00002" })], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/1 ticket panel/),
    });
    const four = panel({ topics: ["a", "b", "c", "d"].map((x) => topic(`topic0000${x}`)) });
    expect(checkTicketPanels([four], free).ok).toBe(false);
    expect(checkTicketPanels([four], pro).ok).toBe(true);
    const form = panel({ topics: [topic("topic00001", ["What happened?"])] });
    expect(checkTicketPanels([form], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Questions/),
    });
    expect(checkTicketPanels([form], pro).ok).toBe(true);
  });

  it("lets a server back on Free keep what it saved on Pro, paused", () => {
    const saved = [
      panel({ topics: [topic("topic00001", ["What happened?"])] }),
      panel({ id: "panel00002" }),
    ];
    expect(checkTicketPanels(saved, free, saved).ok).toBe(true);
    // A new question is still refused.
    const more = [panel({ topics: [topic("topic00001", ["What happened?", "When?"])] }), saved[1]];
    expect(checkTicketPanels(more, free, saved).ok).toBe(false);
    expect(activeQuestions(saved[0]?.topics[0] ?? topic("x"), free)).toEqual([]);
  });

  it("refuses bad topics", () => {
    const long = panel({ topics: [{ ...topic("topic00001"), label: "x".repeat(81) }] });
    expect(checkTicketPanels([long], pro).ok).toBe(false);
    const emoji = panel({ topics: [{ ...topic("topic00001"), emoji: "ab" }] });
    expect(checkTicketPanels([emoji], pro).ok).toBe(false);
    const q = panel({ topics: [topic("topic00001", ["x".repeat(46)])] });
    expect(checkTicketPanels([q], pro).ok).toBe(false);
  });

  it("checks who handles tickets, with auto-assign on Pro", () => {
    const base = { staffRoleIds: ["200000000000000001"], maxOpen: 2, pingStaff: true };
    expect(checkTicketOptions(base, free, { autoAssign: false }).ok).toBe(true);
    expect(checkTicketOptions({ ...base, autoAssign: true }, free, { autoAssign: false }).ok).toBe(
      false,
    );
    expect(checkTicketOptions({ ...base, autoAssign: true }, free, { autoAssign: true }).ok).toBe(
      true,
    );
    expect(checkTicketOptions({ ...base, maxOpen: 9 }, pro, { autoAssign: false }).ok).toBe(false);
    expect(
      checkTicketOptions({ ...base, staffRoleIds: ["x"] }, pro, { autoAssign: false }).ok,
    ).toBe(false);
  });

  it("reads broken rows leniently and names things plainly", () => {
    expect(readTicketConfig({ panels: "nope", maxOpen: 99, staffRoleIds: [1, "2"] })).toMatchObject(
      {
        panels: [],
        maxOpen: 1,
        staffRoleIds: [],
      },
    );
    expect(ticketChannelName(42)).toBe("ticket-0042");
    expect(waitingOn({ status: "open", lastFrom: null })).toBe("staff");
    expect(waitingOn({ status: "open", lastFrom: "staff" })).toBe("member");
    const at = new Date("2026-11-12T00:00:00Z");
    expect(expiresAt(free, at).toISOString()).toBe("2026-12-12T00:00:00.000Z");
    expect(expiresAt(pro, at).getTime() - at.getTime()).toBe(365 * 86_400_000);
  });
});

describe("ticket storage, under each role's grants", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const G = "990";
  const as = async (role: "garrison_bot" | "garrison_web") => {
    await exec("RESET ROLE");
    await exec(`SET ROLE ${role}`);
  };

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await as("garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  it("runs a ticket from setup to expiry", async () => {
    await as("garrison_web");
    const saved = await applySettingsChange(db, {
      guildId: G,
      module: "tickets",
      patch: { panels: [panel()], staffRoleIds: ["200000000000000001"], maxOpen: 2 },
      userId: "1",
      username: "taner",
    });
    expect(saved.ok).toBe(true);

    await as("garrison_bot");
    const config = await getTicketConfig(db, G);
    expect(config).toMatchObject({ maxOpen: 2, staffRoleIds: ["200000000000000001"] });
    expect(config.panels).toHaveLength(1);
    const number = await nextTicketNumber(db, G);
    expect(number).toBe(1);
    const ticket = await openTicket(db, {
      guildId: G,
      number,
      panelId: "panel00001",
      topicId: "topic00001",
      topicLabel: "Get help",
      openerId: "100000000000000001",
      openerName: "rook",
      channelId: "300000000000000001",
      answers: [{ question: "What happened?", answer: "Lost my role" }],
    });
    // A second ticket asked to take the same number gets the next one.
    const second = await openTicket(db, {
      ...ticket,
      number: 1,
      channelId: "300000000000000002",
      answers: [],
    });
    expect(second.number).toBe(2);
    expect(await countOpenTickets(db, G, "100000000000000001")).toBe(2);
    expect((await listOpenTicketChannels(db)).map((t) => t.channelId).sort()).toEqual([
      "300000000000000001",
      "300000000000000002",
    ]);

    const line = {
      ticketId: ticket.id,
      guildId: G,
      authorId: "100000000000000001",
      authorName: "rook",
      staff: false,
      attachments: [],
    };
    await recordTicketMessage(db, {
      ...line,
      discordMessageId: "400000000000000001",
      content: "Hi, my role is gone",
      createdAt: new Date("2026-11-12T10:00:00Z"),
    });
    // The same Discord message twice is recorded once.
    await recordTicketMessage(db, {
      ...line,
      discordMessageId: "400000000000000001",
      content: "Hi, my role is gone",
      createdAt: new Date("2026-11-12T10:00:00Z"),
    });
    await recordTicketMessage(db, {
      ...line,
      authorId: "100000000000000009",
      authorName: "mod",
      staff: true,
      discordMessageId: "400000000000000002",
      content: "On it",
      createdAt: new Date("2026-11-12T10:05:00Z"),
    });
    await editTicketMessage(db, "400000000000000001", {
      content: "Hi, my Raider role is gone",
      attachments: [],
      at: new Date(),
    });
    await markTicketMessageDeleted(db, "400000000000000002");
    await claimTicket(db, ticket.id, { id: "100000000000000009", name: "mod" });
    await recordTicketEvent(db, {
      ticketId: ticket.id,
      guildId: G,
      text: "mod claimed this ticket",
    });

    await as("garrison_web");
    expect(await ticketQueueCounts(db, G)).toEqual({ open: 2, staff: 1, member: 1, unclaimed: 1 });
    expect((await listTickets(db, G, { view: "member" })).map((t) => t.number)).toEqual([1]);
    expect((await listTickets(db, G, { view: "all", q: "raider" })).map((t) => t.number)).toEqual([
      1,
    ]);
    expect((await listTickets(db, G, { view: "all", q: "#2" })).map((t) => t.number)).toEqual([2]);
    const transcript = await listTicketMessages(db, ticket.id);
    expect(transcript.map((m) => m.kind)).toEqual(["message", "message", "event"]);
    expect(transcript[0]?.editedAt).not.toBeNull();
    expect(transcript[1]?.deletedAt).not.toBeNull();
    await addTicketNote(db, {
      ticketId: ticket.id,
      guildId: G,
      authorId: "1",
      authorName: "taner",
      body: "Repeat visitor",
    });
    // The dashboard can't touch tickets or transcripts.
    const denied = (p: PromiseLike<unknown>) =>
      Promise.resolve(p).then(
        () => null,
        (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
      );
    expect(await denied(db.update(tickets).set({ status: "closed" }))).toMatch(/permission denied/);
    expect(await denied(db.delete(ticketMessages))).toMatch(/permission denied/);

    await as("garrison_bot");
    // Open tickets can't be deleted.
    await db.delete(tickets);
    expect(await countOpenTickets(db, G, "100000000000000001")).toBe(2);
    // Closed 40 days ago on Free: its 30 days ran out 10 days ago.
    const closedAt = new Date(Date.now() - 40 * 86_400_000);
    const closed = await closeTicket(db, {
      id: ticket.id,
      by: { id: "100000000000000009", name: "mod" },
      reason: "Role restored",
      expiresAt: expiresAt(free, closedAt),
      at: closedAt,
    });
    expect(closed?.status).toBe("closed");
    // A double press closes nothing.
    expect(
      await closeTicket(db, {
        id: ticket.id,
        by: { id: "1", name: "x" },
        reason: null,
        expiresAt: new Date(),
      }),
    ).toBeNull();
    // A closed one goes only once it has expired.
    expect(await pruneTickets(db, new Date(Date.now() - 20 * 86_400_000))).toBe(0);
    expect(await pruneTickets(db)).toBe(1);
    expect(await listTicketMessages(db, ticket.id)).toEqual([]);
  });
});
