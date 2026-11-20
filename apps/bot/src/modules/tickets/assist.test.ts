import type { TicketMessage } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { knowledgeFor, readAssist, transcriptFor } from "./assist.js";

const line = (i: number, over: Partial<TicketMessage> = {}): TicketMessage => ({
  id: i,
  ticketId: "t",
  guildId: "g",
  kind: "message",
  discordMessageId: null,
  authorId: "u",
  authorName: i % 2 ? "ana" : "mod",
  staff: i % 2 === 0,
  content: `message ${i}`,
  attachments: [],
  createdAt: new Date(),
  editedAt: null,
  deletedAt: null,
  ...over,
});

describe("ticket assist", () => {
  it("reads the form answers and the latest messages, leaving out deleted and events", () => {
    const text = transcriptFor({ answers: [{ question: "What's wrong?", answer: "Can't join" }] }, [
      line(1),
      line(2, { deletedAt: new Date() }),
      line(3, { kind: "event", content: "mod claimed it" }),
      line(4),
    ]);
    expect(text).toContain("What's wrong?: Can't join");
    expect(text).toContain("Member ana: message 1");
    expect(text).toContain("Staff mod: message 4");
    expect(text).not.toContain("message 2");
    expect(text).not.toContain("claimed");
  });

  it("drops the oldest messages first when the ticket is long", () => {
    const lines = Array.from({ length: 40 }, (_, i) =>
      line(i + 1, { content: "x".repeat(400) + i }),
    );
    const text = transcriptFor({ answers: [] }, lines);
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text).toContain(`${"x".repeat(400)}39`);
    expect(text).not.toContain(`${"x".repeat(400)}0\n`);
  });

  it("gives the model the server's enabled tags and answers", () => {
    const base = { channelIds: [], cooldownSeconds: 0 };
    const text = knowledgeFor([
      {
        ...base,
        id: "aaaaaa1",
        name: "Rules",
        trigger: "command",
        text: "rules",
        reply: "Be kind.",
        enabled: true,
      },
      {
        ...base,
        id: "aaaaaa2",
        name: "IP",
        trigger: "word",
        text: "ip",
        reply: "play.example.net",
        enabled: true,
      },
      {
        ...base,
        id: "aaaaaa3",
        name: "Old",
        trigger: "word",
        text: "old",
        reply: "gone",
        enabled: false,
      },
    ]);
    expect(text).toContain("/tag rules: Be kind.");
    expect(text).toContain('"ip": play.example.net');
    expect(text).not.toContain("gone");
  });

  it("splits the answer, and takes it all as the reply without headings", () => {
    expect(readAssist("SUMMARY:\nAna can't join.\n\nREPLY:\nTry rejoining.")).toEqual({
      summary: "Ana can't join.",
      reply: "Try rejoining.",
    });
    expect(readAssist("Just try rejoining.")).toEqual({
      summary: null,
      reply: "Just try rejoining.",
    });
  });
});
