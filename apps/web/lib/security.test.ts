import { describe, expect, it } from "vitest";
import { canManage, memberPermissions } from "./permissions.js";
import {
  hashToken,
  isSameOrigin,
  isSnowflake,
  pkceChallenge,
  pkcePair,
  randomToken,
  safeEqual,
  safeNext,
} from "./security.js";

describe("tokens", () => {
  it("are 256-bit, URL-safe and unique", () => {
    const a = randomToken();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });
  it("are stored as SHA-256 hashes, never as-is", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("PKCE challenge is the S256 of the verifier (RFC 7636 test vector)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(challenge).toBe(pkceChallenge(verifier));
  });
  it("compares state in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/servers/123456789012345678/watch")).toBe("/servers/123456789012345678/watch");
  });
  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/servers?x=<script>",
    "servers",
    "",
    null,
  ])("rejects %j", (bad) => {
    expect(safeNext(bad)).toBe("/servers");
  });
});

describe("isSameOrigin", () => {
  it("accepts only our own origin", () => {
    expect(isSameOrigin("https://dash.garrison.gg", "https://dash.garrison.gg")).toBe(true);
    expect(isSameOrigin("https://evil.gg", "https://dash.garrison.gg")).toBe(false);
    expect(isSameOrigin("https://dash.garrison.gg.evil.gg", "https://dash.garrison.gg")).toBe(
      false,
    );
    expect(isSameOrigin(null, "https://dash.garrison.gg")).toBe(false);
    expect(isSameOrigin("null", "https://dash.garrison.gg")).toBe(false);
  });
});

describe("isSnowflake", () => {
  it("accepts Discord IDs only", () => {
    expect(isSnowflake("123456789012345678")).toBe(true);
    expect(isSnowflake("1' or 1=1")).toBe(false);
    expect(isSnowflake("../etc")).toBe(false);
  });
});

describe("memberPermissions", () => {
  const guild = {
    ownerId: "owner",
    everyoneRoleId: "g",
    roles: [
      { id: "g", permissions: "1024" },
      { id: "mods", permissions: (1n << 5n).toString() },
      { id: "admins", permissions: (1n << 3n).toString() },
    ],
  };
  it("grants access for Manage Server or Administrator", () => {
    expect(canManage(memberPermissions(guild, "u", ["mods"]))).toBe(true);
    expect(canManage(memberPermissions(guild, "u", ["admins"]))).toBe(true);
    expect(canManage(memberPermissions(guild, "owner", []))).toBe(true);
  });
  it("denies everyone else, including unknown roles", () => {
    expect(canManage(memberPermissions(guild, "u", []))).toBe(false);
    expect(canManage(memberPermissions(guild, "u", ["deleted-role"]))).toBe(false);
  });
});
