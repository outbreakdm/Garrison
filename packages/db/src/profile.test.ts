import { describe, expect, it } from "vitest";
import { entitlements } from "./plans";
import { checkProfileRequest, isImageDataUri, PROFILE_LIMITS } from "./profile";

const free = entitlements("free");
const pro = entitlements("pro");
const png = "data:image/png;base64,iVBORw0KGgo=";

describe("profile requests", () => {
  it("lets Free set or clear the nickname, and keeps left-out fields", () => {
    expect(checkProfileRequest({ nick: "  Night   Watch " }, free)).toEqual({
      ok: true,
      value: { nick: "Night Watch" },
    });
    expect(checkProfileRequest({ nick: "" }, free)).toEqual({ ok: true, value: { nick: null } });
    expect(checkProfileRequest({}, free)).toMatchObject({ ok: false, error: "Nothing to change." });
  });

  it("keeps the avatar, banner and bio for Pro, but lets anyone put them back", () => {
    expect(checkProfileRequest({ avatar: png, bio: "Hi" }, free)).toMatchObject({ ok: false });
    expect(checkProfileRequest({ avatar: png, bio: "Hi" }, pro)).toEqual({
      ok: true,
      value: { avatar: png, bio: "Hi" },
    });
    expect(checkProfileRequest({ avatar: null, banner: null, bio: null }, free)).toEqual({
      ok: true,
      value: { avatar: null, banner: null, bio: null },
    });
  });

  it("takes only small PNG, JPEG or GIF data URIs", () => {
    expect(isImageDataUri(png)).toBe(true);
    expect(isImageDataUri("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isImageDataUri("https://example.com/a.png")).toBe(false);
    expect(isImageDataUri(`data:image/png;base64,${"A".repeat(PROFILE_LIMITS.image)}`)).toBe(false);
    expect(checkProfileRequest({ avatar: "javascript:alert(1)" }, pro)).toMatchObject({
      ok: false,
    });
    expect(checkProfileRequest({ nick: "x".repeat(33) }, pro)).toMatchObject({ ok: false });
  });
});
