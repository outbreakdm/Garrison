import { describe, expect, it } from "vitest";
import { type ChatInput, ClaudePlanner } from "./planner.js";
import type { ReadTool } from "./tools.js";

type Body = {
  messages: { role: string; content: unknown }[];
  tools?: { name: string }[];
  tool_choice?: { type: string };
};

/** A fake Claude API: answers each request with the next canned response, and keeps the requests. */
function fakeApi(responses: { content: unknown[]; stop_reason: string }[]) {
  const sent: Body[] = [];
  const fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    sent.push(JSON.parse(String(init?.body)));
    const next = responses[Math.min(sent.length - 1, responses.length - 1)];
    return new Response(
      JSON.stringify({
        id: `msg_${sent.length}`,
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 100 },
        ...next,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;
  return { planner: new ClaudePlanner("test-key", "claude-haiku-5-5", { fetch }), sent };
}

const look = (id: string, name: string, input: unknown = {}) => ({
  content: [{ type: "tool_use", id, name, input }],
  stop_reason: "tool_use",
});
const answer = (reply: string) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify({
        reply,
        choices: [],
        plan_summary: "",
        operations: [],
        plan_notes: "",
      }),
    },
  ],
  stop_reason: "end_turn",
});

const input = (read?: ReadTool): ChatInput => ({
  history: [{ role: "user", text: "Are suggestions on?" }],
  server: { everyoneId: "1", categories: [], roles: [], channelCount: 0, roleCount: 1 },
  channels: [],
  read,
});

describe("the AI builder chat's read tools", () => {
  it("looks at a module's settings, then answers from them", async () => {
    const { planner, sent } = fakeApi([
      look("toolu_1", "module_settings", { module: "suggestions" }),
      answer("Suggestions are on, in #ideas."),
    ]);
    const asked: unknown[] = [];
    const read: ReadTool = async (name, args) => {
      asked.push({ name, args });
      return { text: '{"settings":{"enabled":true,"channelId":"#ideas (5)"}}', error: false };
    };
    const out = await planner.chat(input(read));
    expect(out).toMatchObject({
      ok: true,
      reply: "Suggestions are on, in #ideas.",
      plan: null,
      reads: ["module_settings"],
      usage: { inputTokens: 2000, outputTokens: 200 },
    });
    expect(asked).toEqual([{ name: "module_settings", args: { module: "suggestions" } }]);
    expect(sent[0]?.tools?.map((t) => t.name)).toEqual(["server_overview", "module_settings"]);
    expect(sent[0]?.tool_choice).toEqual({ type: "auto" });
    // The second round carries the look and what it found.
    expect(sent[1]?.messages.at(-2)).toMatchObject({
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_1" }],
    });
    expect(sent[1]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: expect.stringContaining("#ideas") },
      ],
    });
  });

  it("must answer on the last round, however many looks it wants", async () => {
    const { planner, sent } = fakeApi([
      look("a", "server_overview"),
      look("b", "server_overview"),
      look("c", "server_overview"),
      answer("Here's what's set up."),
    ]);
    const out = await planner.chat(input(async () => ({ text: "{}", error: false })));
    expect(out).toMatchObject({
      ok: true,
      reads: ["server_overview", "server_overview", "server_overview"],
    });
    expect(sent).toHaveLength(4);
    expect(sent[3]?.tool_choice).toEqual({ type: "none" });
  });

  it("marks a failed look as an error for the model", async () => {
    const { planner, sent } = fakeApi([
      look("x", "module_settings", { module: "nope" }),
      answer("Hm."),
    ]);
    await planner.chat(input(async () => ({ text: "Unknown module.", error: true })));
    expect(sent[1]?.messages.at(-1)).toMatchObject({
      content: [{ type: "tool_result", is_error: true }],
    });
  });

  it("offers no tools when there's nothing to read with", async () => {
    const { planner, sent } = fakeApi([answer("Hi.")]);
    expect(await planner.chat(input())).toMatchObject({ ok: true, reply: "Hi." });
    expect(sent[0]?.tools).toBeUndefined();
  });
});
