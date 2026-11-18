import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./env", () => ({
  env: () => ({ DISCORD_API_BASE: "https://discord.test", DISCORD_TOKEN: "t" }),
}));

const { DiscordError, memberNow, retryDelay } = await import("./discord");

const MANAGE = String(1n << 5n);
const guild = {
  id: "100000000000000000",
  owner_id: "999",
  roles: [
    { id: "100000000000000000", name: "@everyone", position: 0, permissions: "0" },
    { id: "200000000000000000", name: "Mods", position: 1, permissions: MANAGE },
  ],
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** Answers each request with the next of `answers`, per path. */
function discordAnswering(answers: Record<string, (Response | Error)[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      calls.push(path);
      const next = answers[path]?.shift();
      if (!next) throw new Error(`unexpected ${path}`);
      if (next instanceof Error) throw next;
      return next;
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("retryDelay", () => {
  it("waits out short rate limits, and gives up on long ones", () => {
    expect(retryDelay(429, "0.4", true)).toBe(400);
    expect(retryDelay(429, null, false)).toBe(1000);
    expect(retryDelay(429, "30", true)).toBeNull();
  });

  it("retries a read that failed on Discord's side, never a write", () => {
    expect(retryDelay(502, null, true)).toBe(300);
    expect(retryDelay(0, null, true)).toBe(300);
    expect(retryDelay(502, null, false)).toBeNull();
    expect(retryDelay(404, null, true)).toBeNull();
    expect(retryDelay(403, null, true)).toBeNull();
  });
});

describe("memberNow", () => {
  it("rides out one rate limit and still answers", async () => {
    const id = "100000000000000001";
    const calls = discordAnswering({
      [`/guilds/${id}`]: [json(429, {}, { "retry-after": "0.05" }), json(200, { ...guild, id })],
      [`/guilds/${id}/members/1`]: [json(200, { roles: ["200000000000000000"] })],
    });
    await expect(memberNow(id, "1")).resolves.toEqual({
      manage: true,
      roleIds: ["200000000000000000"],
    });
    expect(calls.filter((c) => c === `/guilds/${id}`)).toHaveLength(2);
  });

  it("is no access when Discord says the person isn't in the server", async () => {
    const id = "100000000000000002";
    discordAnswering({
      [`/guilds/${id}`]: [json(200, { ...guild, id })],
      [`/guilds/${id}/members/1`]: [json(404, { message: "Unknown Member" })],
    });
    await expect(memberNow(id, "1")).resolves.toBeNull();
  });

  it("throws, never grants, when Discord keeps failing", async () => {
    const id = "100000000000000003";
    discordAnswering({
      [`/guilds/${id}`]: [json(502, {}), json(502, {})],
      [`/guilds/${id}/members/1`]: [json(200, { roles: [] })],
    });
    await expect(memberNow(id, "1")).rejects.toBeInstanceOf(DiscordError);
  });
});
