import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Pure security helpers: no secrets, no I/O, so they can be unit tested. */

const base64url = (buf: Buffer) => buf.toString("base64url");

/** A 256-bit random token, URL-safe. Used for session cookies and OAuth state. */
export const randomToken = () => base64url(randomBytes(32));

/** What we store for a session: the SHA-256 of its token, never the token. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** PKCE (RFC 7636) S256 challenge for a verifier. */
export const pkceChallenge = (verifier: string) =>
  base64url(createHash("sha256").update(verifier).digest());

/** PKCE: a random verifier and its challenge. */
export function pkcePair() {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier) };
}

/** Constant-time string comparison, for OAuth state. */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Where to send the user after login. Only same-site paths: "/servers/1".
 * Rejects "//evil.com", "/\\evil.com", "https://…" and anything odd, to stop open redirects.
 */
export function safeNext(next: string | null | undefined, fallback = "/servers") {
  if (!next || next.length > 200) return fallback;
  if (!/^\/(?![/\\])[\w\-/]*$/.test(next)) return fallback;
  return next;
}

/** A state-changing request must come from our own origin (CSRF defense alongside SameSite cookies). */
export function isSameOrigin(originHeader: string | null, appUrl: string) {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/** Discord snowflakes are 17–20 digit numbers. Anything else in a URL is rejected before any lookup. */
export const isSnowflake = (id: string) => /^\d{17,20}$/.test(id);
