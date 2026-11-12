/**
 * Garrison's profile in one server: the nickname (Free) and the avatar, banner and
 * bio (Pro), set through Discord's Modify Current Member. Pure and browser-safe,
 * so the dashboard and the bot check a request with the same rules.
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";
import type { BotProfilePayload } from "./schema";

export const PROFILE_LIMITS = {
  /** Discord's nickname limit. */
  nick: 32,
  /** Discord's bio limit. */
  bio: 190,
  /** A data URI, after the browser resizes the image. Well inside Discord's own limit. */
  image: 400_000,
} as const;

/** Sizes the browser resizes to before sending: small enough to stay fast. */
export const PROFILE_IMAGE_SIZE = {
  avatar: { width: 256, height: 256 },
  banner: { width: 960, height: 384 },
} as const;

const DATA_URI = /^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export const isImageDataUri = (v: string) => v.length <= PROFILE_LIMITS.image && DATA_URI.test(v);

const has = (r: Record<string, unknown>, k: string) => Object.hasOwn(r, k) && r[k] !== undefined;

/**
 * Check a profile change. Fields left out stay as they are; null resets them. The
 * avatar, banner and bio need Pro; putting them back to Garrison's own never does,
 * so a server that left Pro can always undo its look.
 */
export function checkProfileRequest(raw: unknown, ent: Entitlements): Parsed<BotProfilePayload> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "That request wasn't valid." };
  const r = raw as Record<string, unknown>;
  const out: BotProfilePayload = {};
  if (has(r, "nick")) {
    if (r.nick !== null && typeof r.nick !== "string")
      return { ok: false, error: "That nickname isn't valid." };
    const nick = typeof r.nick === "string" ? r.nick.replace(/\s+/g, " ").trim() : "";
    if (nick.length > PROFILE_LIMITS.nick)
      return { ok: false, error: `Nicknames can be ${PROFILE_LIMITS.nick} characters at most.` };
    out.nick = nick || null;
  }
  if (has(r, "bio")) {
    if (r.bio !== null && typeof r.bio !== "string")
      return { ok: false, error: "That bio isn't valid." };
    const bio = typeof r.bio === "string" ? r.bio.replace(/\r\n?/g, "\n").trim() : "";
    if (bio.length > PROFILE_LIMITS.bio)
      return { ok: false, error: `The bio can be ${PROFILE_LIMITS.bio} characters at most.` };
    out.bio = bio || null;
  }
  for (const key of ["avatar", "banner"] as const) {
    if (!has(r, key)) continue;
    const v = r[key];
    if (v !== null && (typeof v !== "string" || !isImageDataUri(v)))
      return {
        ok: false,
        error: `That ${key} isn't a PNG, JPEG or GIF image Garrison can use. Try a smaller one.`,
      };
    out[key] = v as string | null;
  }
  if (!ent["profile.identity"]) {
    const pro = (["avatar", "banner", "bio"] as const).filter((k) => out[k] != null);
    if (pro.length)
      return {
        ok: false,
        error: `Garrison's own ${pro.join(" and ")} in your server ${pro.length === 1 ? "is" : "are"} part of Garrison Pro.`,
      };
  }
  if (!Object.keys(out).length) return { ok: false, error: "Nothing to change." };
  return { ok: true, value: out };
}
