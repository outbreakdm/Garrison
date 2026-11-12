import { type LinkProvider, linkProviders } from "@garrison/brand";
import type { LinkedAccount } from "@garrison/db";
import { safeText } from "../../lib/text.js";

export const providerLabel = (p: string) => linkProviders[p as LinkProvider]?.label ?? p;

type LinkFacts = Pick<LinkedAccount, "provider" | "displayName" | "verified" | "details">;

/** One account in plain words, for drawn images: "OSRS · Zezima · total 2277 · combat 126". */
export function plainLink(l: LinkFacts, opts: { proof?: boolean } = {}) {
  const parts = [providerLabel(l.provider), l.displayName];
  const d = l.details as Record<string, unknown>;
  if (l.provider === "osrs" && typeof d.totalLevel === "number")
    parts.push(`total ${d.totalLevel}`, `combat ${d.combatLevel}`);
  if (l.provider === "rs3" && typeof d.totalLevel === "number") parts.push(`total ${d.totalLevel}`);
  if (l.provider === "wow" && typeof d.level === "number") {
    parts.push(`${d.level} ${typeof d.className === "string" ? d.className : ""}`.trim());
    if (typeof d.realm === "string") parts.push(d.realm);
  }
  if (opts.proof !== false) parts.push(l.verified ? "verified" : "claimed");
  return parts.join(" · ");
}

/** One account, as a roster line: "OSRS · Zezima · total 2277 · combat 126 · claimed". */
export const describeLink = (l: LinkFacts) => safeText(plainLink(l));
