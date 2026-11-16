import { DiscordAPIError } from "discord.js";
import { describe, expect, it } from "vitest";
import { discordRefusal } from "./patterns.js";

const refusal = (errors: unknown, message = "Invalid Form Body") =>
  new DiscordAPIError(
    { code: 50035, message, errors: errors as never },
    50035,
    400,
    "POST",
    "/x",
    {},
  );

describe("Discord's answer about the patterns", () => {
  it("names the pattern Discord refused", () => {
    const error = refusal({
      trigger_metadata: {
        regex_patterns: { 2: { _errors: [{ code: "X", message: "Invalid regex pattern" }] } },
      },
    });
    expect(discordRefusal(error)).toBe("Pattern 3: Invalid regex pattern");
  });

  it("falls back to Discord's own words, and says when Discord was silent", () => {
    expect(discordRefusal(refusal(undefined, "Maximum number of rules reached"))).toBe(
      "Maximum number of rules reached",
    );
    expect(discordRefusal(new Error("socket hang up"))).toMatch(/didn't answer/);
  });
});
