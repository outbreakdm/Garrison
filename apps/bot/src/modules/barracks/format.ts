import { type LinkProvider, linkProviders } from "@garrison/brand";
import type { LinkedAccount } from "@garrison/db";
import { safeText } from "../../lib/text.js";

export const providerLabel = (p: string) => linkProviders[p as LinkProvider]?.label ?? p;

/** One account, as a roster line: "OSRS · Zezima · total 2277 · combat 126 · claimed". */
export function describeLink(
  l: Pick<LinkedAccount, "provider" | "displayName" | "verified" | "details">,
) {
  const parts = [providerLabel(l.provider), safeText(l.displayName)];
  const d = l.details as Record<string, unknown>;
  if (l.provider === "osrs" && typeof d.totalLevel === "number")
    parts.push(`total ${d.totalLevel}`, `combat ${d.combatLevel}`);
  if (l.provider === "wow" && typeof d.level === "number") {
    parts.push(`${d.level} ${typeof d.className === "string" ? safeText(d.className) : ""}`.trim());
    if (typeof d.realm === "string") parts.push(safeText(d.realm));
  }
  parts.push(l.verified ? "verified" : "claimed");
  return parts.join(" · ");
}
