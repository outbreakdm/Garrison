import { type LinkProvider, linkProviders } from "@garrison/brand";

/** Short marks for each game, drawn on a chamfered plate: no third-party logos. */
const MARKS: Record<string, string> = {
  steam: "ST",
  battlenet: "BN",
  riotgames: "RG",
  leagueoflegends: "LoL",
  xbox: "XB",
  playstation: "PS",
  epicgames: "EG",
  bungie: "BG",
  roblox: "RB",
  osrs: "OS",
  rs3: "RS",
  wow: "WoW",
};

export const providerLabel = (provider: string) =>
  linkProviders[provider as LinkProvider]?.label ?? provider;

export function GameMark({ provider, small = false }: { provider: string; small?: boolean }) {
  return (
    <span className={`game-mark ${small ? "game-mark--sm" : ""}`} aria-hidden="true">
      {MARKS[provider] ?? provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Game details a link carries: OSRS levels, or a WoW character's level, class and realm. */
export function linkDetail(d: Record<string, unknown>) {
  if (typeof d.totalLevel === "number")
    return typeof d.combatLevel === "number"
      ? `total ${d.totalLevel} · combat ${d.combatLevel}`
      : `total ${d.totalLevel}`;
  if (typeof d.level === "number")
    return [d.level, d.className, d.realm].filter(Boolean).join(" · ");
  return "";
}
