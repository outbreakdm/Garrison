import { describe, expect, it } from "vitest";
import { BUILD_PROMPT_MAX, cleanPrompt, packPrompt, unpackPrompt } from "./build-prompt";

describe("cleanPrompt", () => {
  it("folds whitespace and control characters, and trims", () => {
    expect(cleanPrompt("  A raid\tguild\n\nwith  signups\u0000 ")).toBe(
      "A raid guild with signups",
    );
  });
  it("caps the length", () => {
    expect(cleanPrompt("x".repeat(BUILD_PROMPT_MAX + 50))).toHaveLength(BUILD_PROMPT_MAX);
  });
  it.each([undefined, null, 42, ["a"], {}])("is empty for %j", (v) => {
    expect(cleanPrompt(v)).toBe("");
  });
});

describe("packPrompt / unpackPrompt", () => {
  it("round-trips any text, quotes and emoji included", () => {
    const idea = "A café's “book club” 📚; spoilers=off";
    expect(unpackPrompt(packPrompt(idea))).toBe(idea);
  });
  it.each([undefined, "", "not base64!", "a;b=c", "x".repeat(1001)])("rejects %j", (v) => {
    expect(unpackPrompt(v)).toBe("");
  });
  it("cleans what it unpacks", () => {
    expect(unpackPrompt(Buffer.from("  two\n\nlines ").toString("base64url"))).toBe("two lines");
  });
});
