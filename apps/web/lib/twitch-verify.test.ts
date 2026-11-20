import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTwitchMessage } from "./twitch-verify";

const SECRET = "a-long-enough-secret";
const sign = (id: string, ts: string, body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret)
    .update(id + ts + body)
    .digest("hex")}`;

describe("Twitch webhooks", () => {
  const body = '{"subscription":{"type":"channel.subscribe"}}';
  const now = Date.parse("2026-11-20T12:00:00Z");
  const ts = "2026-11-20T11:59:30Z";

  it("takes a message Twitch signed in the last 10 minutes", () => {
    expect(
      verifyTwitchMessage(
        SECRET,
        { id: "m1", timestamp: ts, signature: sign("m1", ts, body) },
        body,
        now,
      ),
    ).toBe(true);
  });

  it("refuses a wrong secret, a changed body, an old message and missing headers", () => {
    const good = { id: "m1", timestamp: ts, signature: sign("m1", ts, body) };
    expect(
      verifyTwitchMessage(
        SECRET,
        { ...good, signature: sign("m1", ts, body, "another-secret") },
        body,
        now,
      ),
    ).toBe(false);
    expect(verifyTwitchMessage(SECRET, good, `${body} `, now)).toBe(false);
    expect(verifyTwitchMessage(SECRET, good, body, now + 11 * 60_000)).toBe(false);
    expect(verifyTwitchMessage(SECRET, { ...good, signature: null }, body, now)).toBe(false);
  });
});
