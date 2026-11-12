import { blankCard, entitlements, type Ticket, type TicketPanel } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardMessage, cardTexts } from "../../lib/card.js";
import { openingCard, panelMessage, parseTicketId } from "./panel.js";

const UUID = "0b5b3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const panel: TicketPanel = {
  id: "panel00001",
  name: "Support",
  card: blankCard("Need a hand?"),
  topics: ["a", "b", "c", "d"].map((x) => ({
    id: `topic0000${x}`,
    label: `Topic ${x}`,
    emoji: null,
    questions: [],
  })),
};

type Node = { type: number; custom_id?: string; components?: Node[] };
const all = (n: Node): Node[] => [n, ...(n.components ?? []).flatMap(all)];
const buttons = (m: { components: { toJSON(): unknown }[] }) =>
  all(m.components[0]?.toJSON() as Node).filter((n) => n.type === 2);

describe("ticket messages", () => {
  it("shows only the topics the plan runs", () => {
    expect(buttons(panelMessage(panel, entitlements("free"))).map((b) => b.custom_id)).toEqual([
      "tk:o:panel00001:topic0000a",
      "tk:o:panel00001:topic0000b",
      "tk:o:panel00001:topic0000c",
    ]);
    expect(buttons(panelMessage(panel, entitlements("pro")))).toHaveLength(4);
  });

  it("reads custom IDs back, and nothing else", () => {
    expect(parseTicketId("tk:o:panel00001:topic0000a")).toEqual({
      kind: "open",
      panelId: "panel00001",
      topicId: "topic0000a",
    });
    expect(parseTicketId(`tk:c:${UUID}`)).toEqual({ kind: "claim", ticketId: UUID });
    expect(parseTicketId(`tk:x:${UUID}`)).toEqual({ kind: "close", ticketId: UUID });
    expect(parseTicketId(`tk:r:${UUID}`)).toEqual({ kind: "reason", ticketId: UUID });
    expect(parseTicketId("tk:o:../x:y")).toBeNull();
    expect(parseTicketId("rm:abc123def0")).toBeNull();
  });

  it("opens with the member's answers made inert, and claim and close buttons", () => {
    const ticket = {
      id: UUID,
      number: 42,
      topicLabel: "Report a member",
      openerId: "100000000000000001",
      claimedBy: null,
      claimedName: null,
      answers: [{ question: "Who?", answer: "@everyone [click](https://evil.example)" }],
      openedAt: new Date("2026-11-12T10:00:00Z"),
    } as unknown as Ticket;
    const message = cardMessage(openingCard(ticket, { staffRoleIds: ["200000000000000001"] }));
    const text = cardTexts(message).join("\n");
    expect(text).toContain("Ticket #42 · Report a member");
    expect(text).toContain("<@&200000000000000001>");
    expect(text).not.toContain("@everyone [click]");
    expect(buttons(message).map((b) => b.custom_id)).toEqual([`tk:c:${UUID}`, `tk:x:${UUID}`]);
  });
});
