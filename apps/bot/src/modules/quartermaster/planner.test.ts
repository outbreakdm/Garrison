import { costMicros, QM_MAX_OUTPUT_TOKENS, roundWorstMicros } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { CHAT_TOO_BIG, CHAT_TOO_SLOW, type ChatInput, ClaudePlanner } from "./planner.js";
import type { ReadTool } from "./tools.js";

type Body = {
  messages: { role: string; content: unknown }[];
  system?: unknown;
  cache_control?: unknown;
  tools?: { name: string }[];
  tool_choice?: { type: string };
  max_tokens?: number;
};

type Canned = { content: unknown[]; stop_reason: string; usage?: unknown; status?: number };

/**
 * A fake Claude API: answers each request with the next canned response, and keeps the
 * requests. Token counts answer `inputTokens` (one number, or one per count in turn) and are
 * kept apart, in `counted`.
 */
function fakeApi(
  responses: Canned[],
  opts: { inputTokens?: number | number[]; model?: string } = {},
) {
  const sent: Body[] = [];
  const counted: Body[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetch = (async (url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("count_tokens")) {
      counted.push(body);
      const n = opts.inputTokens ?? 1000;
      const tokens = Array.isArray(n) ? n[Math.min(counted.length - 1, n.length - 1)] : n;
      return json({ input_tokens: tokens });
    }
    sent.push(body);
    const { status, ...next } = responses[Math.min(sent.length - 1, responses.length - 1)] ?? {
      content: [],
      stop_reason: "end_turn",
    };
    if (status) return json({ type: "error", error: { type: "overloaded_error" } }, status);
    return json({
      id: `msg_${sent.length}`,
      type: "message",
      role: "assistant",
      model: opts.model ?? "claude-haiku-5-5",
      stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 100 },
      ...next,
    });
  }) as typeof globalThis.fetch;
  return {
    planner: new ClaudePlanner("test-key", opts.model ?? "claude-haiku-5-5", {
      fetch,
      retryDelayMs: 1,
    }),
    sent,
    counted,
  };
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
        order: [],
        edits: [],
        plan_notes: "",
        settings: [],
        posts: [],
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

describe("the AI assistant chat's read tools", () => {
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

  it("caches the instructions and the rounds, and counts cached tokens apart", async () => {
    const { planner, sent } = fakeApi([
      {
        ...answer("Suggestions are on."),
        usage: {
          input_tokens: 500,
          output_tokens: 100,
          cache_read_input_tokens: 4000,
          cache_creation_input_tokens: 0,
        },
      },
    ]);
    const out = await planner.chat(input(async () => ({ text: "{}", error: false })));
    expect(sent[0]?.system).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Garrison"),
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(sent[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(out.usage).toMatchObject({
      inputTokens: 500,
      cacheReadTokens: 4000,
      cacheWriteTokens: 0,
    });
    // A one-round message with nothing to look at caches only the instructions.
    const quick = fakeApi([answer("Hi.")]);
    await quick.planner.chat(input());
    expect(quick.sent[0]?.cache_control).toBeUndefined();
  });

  it("must answer on the last round, however many looks it wants", async () => {
    const { planner, sent } = fakeApi([
      look("a", "server_overview"),
      look("b", "server_overview"),
      answer("Here's what's set up."),
    ]);
    const out = await planner.chat(input(async () => ({ text: "{}", error: false })));
    expect(out).toMatchObject({
      ok: true,
      reads: ["server_overview", "server_overview"],
    });
    expect(sent).toHaveLength(3);
    expect(sent[2]?.tool_choice).toEqual({ type: "none" });
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

describe("chat deadline", () => {
  it("ends a reply that never comes with a plain 'took too long'", async () => {
    // Claude never answers: the request only ends when it's aborted.
    const fetch = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new Error("aborted")),
        );
      })) as typeof globalThis.fetch;
    const planner = new ClaudePlanner("test-key", "claude-haiku-5-5", {
      fetch,
      chatDeadlineMs: 50,
    });
    const result = await planner.chat(input());
    expect(result).toMatchObject({ ok: false, error: CHAT_TOO_SLOW });
  });
});

const haiku = "claude-haiku-5-5";
/** What a response's usage cost, as the planner prices it. */
const billed = (u: { input_tokens: number; output_tokens: number }) =>
  costMicros(haiku, u.input_tokens, u.output_tokens);

describe("a message never costs more than it holds", () => {
  it("counts each request first and fits the answer inside the hold", async () => {
    const { planner, sent, counted } = fakeApi([answer("Hi.")], { inputTokens: 20_000 });
    // 4 supplies: 20,000 tokens in at the cache-write rate leaves room for about 3,000 out.
    const out = await planner.chat({ ...input(), budgetMicros: 4000 });
    expect(out).toMatchObject({ ok: true });
    expect(counted).toHaveLength(1);
    const max = sent[0]?.max_tokens ?? 0;
    expect(max).toBeGreaterThan(2900);
    expect(roundWorstMicros(haiku, 20_064, max)).toBeLessThanOrEqual(4000);
  });

  it("keeps the usual output cap when the hold has room", async () => {
    const { planner, sent } = fakeApi([answer("Hi.")]);
    await planner.chat({ ...input(), budgetMicros: 14_000 });
    expect(sent[0]?.max_tokens).toBe(QM_MAX_OUTPUT_TOKENS);
  });

  it("drops the oldest turns before it gives up on a big conversation", async () => {
    // Too big with the whole conversation, fits once two old turns are dropped.
    const { planner, sent } = fakeApi([answer("Sure.")], { inputTokens: [60_000, 9000] });
    const history: ChatInput["history"] = [
      { role: "user", text: "Make a Valorant section." },
      { role: "assistant", text: "How big is the community?" },
      { role: "user", text: "About 200." },
    ];
    const out = await planner.chat({ ...input(), history, budgetMicros: 4000 });
    expect(out).toMatchObject({ ok: true });
    // Only the admin's latest message is left.
    expect(sent[0]?.messages).toHaveLength(1);
  });

  it("sends nothing when even the latest message can't fit", async () => {
    const { planner, sent } = fakeApi([answer("Hi.")], { inputTokens: 40_000 });
    const out = await planner.chat({ ...input(), budgetMicros: 4000 });
    expect(out).toMatchObject({ ok: false, error: CHAT_TOO_BIG });
    expect(out.usage).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("stops looking when what's left wouldn't pay for an answer", async () => {
    const { planner, sent } = fakeApi([answer("Done.")], { inputTokens: 12_000 });
    // 6 supplies: one full round fits, a look and then an answer don't.
    const out = await planner.chat({
      ...input(async () => ({ text: "{}", error: false })),
      budgetMicros: 6000,
    });
    expect(out).toMatchObject({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tool_choice).toEqual({ type: "none" });
  });

  it("fits every round inside what the earlier ones left", async () => {
    const looks = [look("a", "server_overview"), look("b", "server_overview"), answer("Ok.")];
    const inputs = [12_000, 14_000, 16_000];
    const { planner, sent } = fakeApi(looks, { inputTokens: inputs });
    const budget = 14_000;
    const out = await planner.chat({
      ...input(async () => ({ text: "{}", error: false })),
      budgetMicros: budget,
    });
    expect(out.ok).toBe(true);
    // The worst each round could have cost, after what was really spent before it.
    let spent = 0;
    for (const [i, body] of sent.entries()) {
      const worst = roundWorstMicros(haiku, (inputs[i] ?? 0) + 64, body.max_tokens ?? 0);
      expect(spent + worst).toBeLessThanOrEqual(budget);
      spent += billed({ input_tokens: 1000, output_tokens: 100 });
    }
    expect(out.usage?.costMicros).toBe(spent);
  });

  it("retries what the API turned away unbilled, and charges nothing for it", async () => {
    const { planner, sent } = fakeApi([
      { content: [], stop_reason: "end_turn", status: 529 },
      answer("Hi."),
    ]);
    const out = await planner.chat({ ...input(), budgetMicros: 14_000 });
    expect(out).toMatchObject({ ok: true, reply: "Hi." });
    expect(sent).toHaveLength(2);
    expect(out.usage?.costMicros).toBe(billed({ input_tokens: 1000, output_tokens: 100 }));
  });

  it("charges a request that may have been billed without an answer its worst case", async () => {
    // Counts answer; the message itself never does.
    const fetch = ((url: unknown, init?: { signal?: AbortSignal }) =>
      String(url).includes("count_tokens")
        ? Promise.resolve(
            new Response(JSON.stringify({ input_tokens: 5000 }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          )
        : new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason ?? new Error("aborted")),
            );
          })) as typeof globalThis.fetch;
    const planner = new ClaudePlanner("test-key", haiku, { fetch, chatDeadlineMs: 50 });
    const out = await planner.chat({ ...input(), budgetMicros: 14_000 });
    expect(out).toMatchObject({ ok: false, error: CHAT_TOO_SLOW });
    expect(out.usage?.costMicros).toBe(roundWorstMicros(haiku, 5064, QM_MAX_OUTPUT_TOKENS));
  });

  it("fits a one-shot plan inside its hold too", async () => {
    const plan = { summary: "x", operations: [], notes: "" };
    const { planner, sent } = fakeApi(
      [{ content: [{ type: "text", text: JSON.stringify(plan) }], stop_reason: "end_turn" }],
      { inputTokens: 20_000 },
    );
    await planner.plan({ ...input(), request: "A clips channel", budgetMicros: 4000 });
    expect(roundWorstMicros(haiku, 20_064, sent[0]?.max_tokens ?? 0)).toBeLessThanOrEqual(4000);
    const big = fakeApi([], { inputTokens: 40_000 });
    expect(
      await big.planner.plan({ ...input(), request: "Everything", budgetMicros: 4000 }),
    ).toMatchObject({ ok: false, error: CHAT_TOO_BIG });
    expect(big.sent).toHaveLength(0);
  });

  it("won't run a model it can't price", () => {
    expect(() => new ClaudePlanner("test-key", "claude-new-model")).toThrow(/MODEL_PRICES/);
  });

  it("sends Sonnet's refusal fallback and holds for both attempts", async () => {
    const { planner, sent } = fakeApi([answer("Hi.")], {
      inputTokens: 12_000,
      model: "claude-sonnet-5-5",
    });
    await planner.chat({ ...input(), budgetMicros: 90_000 });
    expect((sent[0] as Body & { fallbacks?: unknown }).fallbacks).toEqual([
      { model: "claude-sonnet-5" },
    ]);
    // Twice the worst case must fit in the hold.
    const max = sent[0]?.max_tokens ?? 0;
    expect(roundWorstMicros("claude-sonnet-5-5", 12_064, max, 2)).toBeLessThanOrEqual(90_000);
    expect(roundWorstMicros("claude-sonnet-5-5", 12_064, max + 1, 2)).toBeGreaterThan(90_000);
  });
});
