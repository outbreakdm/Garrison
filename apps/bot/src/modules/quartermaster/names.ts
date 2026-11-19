/** Name rules shared by new and edited channels, categories and roles. */

/** The most roles one channel can be private to, or let post when it's read-only. */
export const MAX_PRIVATE_ROLES = 5;

/** Discord text-channel names: lowercase, no spaces, 1–90 chars of letters, numbers, - and _. */
export function channelName(raw: string) {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/** Names for categories, voice channels and roles: no control characters, mentions or markdown. */
export function displayName(raw: string, max = 90) {
  return raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[@#<>*_`~|\\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
