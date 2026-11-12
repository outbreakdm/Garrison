import type { ModCase } from "@garrison/db";

/**
 * Alt-account warning signs: does someone joining look like a member banned here
 * recently? A matching name (ignoring case, symbols and trailing digits, or one
 * or two letters off), a young account and no avatar each count. A warning goes
 * to staff; nothing happens to the member: it's a hint for a human to check.
 */

export interface Joiner {
  username: string;
  displayName: string;
  hasAvatar: boolean;
  ageDays: number;
}

export interface AltMatch {
  ban: Pick<ModCase, "caseNumber" | "targetId" | "targetTag" | "createdAt">;
  reasons: string[];
}

/** "xX_Rook_99Xx" → "rook": lower case, letters and digits only, trailing numbers off. */
export function nameKey(name: string) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^x+|x+$/g, "")
    .replace(/\d+$/, "");
}

/** Edit distance, stopping early past `max`. */
export function distance(a: string, b: string, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

/** The recent ban this joiner most looks like, with why. Null below two signs (or no name match). */
export function altSignals(
  joiner: Joiner,
  bans: Pick<ModCase, "caseNumber" | "targetId" | "targetTag" | "createdAt">[],
  youngDays = 30,
): AltMatch | null {
  const keys = [nameKey(joiner.username), nameKey(joiner.displayName)].filter((k) => k.length >= 4);
  if (!keys.length) return null;
  for (const ban of bans) {
    const banned = nameKey(ban.targetTag ?? "");
    if (banned.length < 4) continue;
    const same = keys.some((k) => k === banned);
    const close = !same && keys.some((k) => distance(k, banned, 2) <= 2);
    if (!same && !close) continue;
    const reasons = [same ? "the same name" : "a very similar name"];
    if (joiner.ageDays < youngDays)
      reasons.push(`an account ${Math.floor(joiner.ageDays)} days old`);
    if (!joiner.hasAvatar) reasons.push("no avatar");
    // A near-identical name alone is worth a look; a close one needs one more sign.
    if (same || reasons.length >= 2) return { ban, reasons };
  }
  return null;
}
