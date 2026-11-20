import { afterEach, describe, expect, it } from "vitest";
import { AI_PER_MINUTE, aiPaused, moderateText, pauseFor, takeAiBudget } from "./automod.js";

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

describe("AI moderation", () => {
  it("asks OpenAI's moderation model and reads its scores", async () => {
    let sent: { url: string; body: unknown; auth: string | null } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = {
        url: String(url),
        body: JSON.parse(String(init.body)),
        auth: new Headers(init.headers).get("authorization"),
      };
      return new Response(JSON.stringify({ results: [{ category_scores: { hate: 0.8 } }] }));
    }) as typeof fetch;
    expect(await moderateText("sk-test", "some text")).toEqual({ hate: 0.8 });
    expect(sent).toMatchObject({
      url: "https://api.openai.com/v1/moderations",
      body: { model: "omni-moderation-latest", input: "some text" },
      auth: "Bearer sk-test",
    });
  });

  it("gives up quietly when OpenAI can't answer", async () => {
    globalThis.fetch = (async () => new Response("no", { status: 429 })) as typeof fetch;
    expect(await moderateText("sk-test", "x")).toBeNull();
  });
});

describe("AI moderation's rate, now that it's on every plan", () => {
  it("gives Free servers fewer checks a minute than Pro", () => {
    // Ten minutes on, clear of the pause a 429 in another test sets.
    const at = Math.floor(Date.now() / 60_000) * 60_000 + 10 * 60_000;
    let free = 0;
    let pro = 0;
    for (let i = 0; i < 100; i++) {
      if (takeAiBudget("free-guild", AI_PER_MINUTE.free, at)) free++;
      if (takeAiBudget("pro-guild", AI_PER_MINUTE.pro, at)) pro++;
    }
    expect([free, pro]).toEqual([AI_PER_MINUTE.free, AI_PER_MINUTE.pro]);
    // A new minute, a new allowance.
    expect(takeAiBudget("free-guild", AI_PER_MINUTE.free, at + 60_000)).toBe(true);
  });

  it("pauses every server's checks for as long as OpenAI asks after a 429", async () => {
    expect(pauseFor("12")).toBe(12_000);
    expect(pauseFor(null)).toBe(20_000);
    expect(pauseFor("99999")).toBe(300_000);
    globalThis.fetch = (async () =>
      new Response("slow down", { status: 429, headers: { "retry-after": "30" } })) as typeof fetch;
    expect(await moderateText("sk-test", "x")).toBeNull();
    expect(aiPaused()).toBe(true);
    expect(takeAiBudget("another-guild", AI_PER_MINUTE.pro)).toBe(false);
    expect(aiPaused(Date.now() + 31_000)).toBe(false);
  });
});
