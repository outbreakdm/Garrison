import { describe, expect, it } from "vitest";
import { serialize } from "./logger.js";

describe("log redaction", () => {
  it("drops secret-looking keys", () => {
    const out = serialize({ token: "abc", headers: { Authorization: "Bot abc" }, guildId: "1" });
    expect(out).toBe(
      '{"token":"[redacted]","headers":{"Authorization":"[redacted]"},"guildId":"1"}',
    );
  });

  it("scrubs tokens and connection strings inside values and errors", () => {
    const fakeToken = `${"M".repeat(26)}.${"G".repeat(6)}.${"x".repeat(38)}`;
    const out = serialize({
      note: `login with ${fakeToken}`,
      error: new Error(
        "connect failed: postgresql://garrison_bot.ref:hunter2@pooler.supabase.com:6543/postgres",
      ),
    });
    expect(out).not.toContain(fakeToken);
    expect(out).not.toContain("hunter2");
    expect(out).toContain("[redacted]");
  });

  it("keeps ordinary data, including bigints", () => {
    expect(serialize({ guildId: "123", bits: 2048n })).toBe('{"guildId":"123","bits":"2048"}');
  });
});
