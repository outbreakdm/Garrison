import { afterEach, describe, expect, it } from "vitest";
import { moderateText } from "./automod.js";

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
