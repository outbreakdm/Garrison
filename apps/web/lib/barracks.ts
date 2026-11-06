import { discordConnectionProviders } from "@garrison/brand";

/** Pure mapping of provider responses to links. No secrets, no I/O. */

export interface DiscordConnection {
  id: string;
  name: string;
  type: string;
  verified?: boolean;
  revoked?: boolean;
}

export interface LinkDraft {
  provider: string;
  accountId: string;
  displayName: string;
  verified: true;
  details: Record<string, unknown>;
}

/** Only verified, not-revoked game connections become links. Spotify, YouTube and the like are ignored. */
export function linksFromConnections(connections: unknown): LinkDraft[] {
  if (!Array.isArray(connections)) return [];
  return connections
    .filter(
      (c): c is DiscordConnection =>
        typeof c?.id === "string" && typeof c?.name === "string" && typeof c?.type === "string",
    )
    .filter(
      (c) =>
        c.verified === true && c.revoked !== true && discordConnectionProviders.includes(c.type),
    )
    .map((c) => ({
      provider: c.type,
      accountId: c.id,
      displayName: c.name.slice(0, 100),
      verified: true,
      details: {},
    }));
}

export const WOW_REGIONS = ["us", "eu", "kr", "tw"] as const;
export type WowRegion = (typeof WOW_REGIONS)[number];
export const isWowRegion = (r: unknown): r is WowRegion =>
  typeof r === "string" && (WOW_REGIONS as readonly string[]).includes(r);

/** Characters from Blizzard's /profile/user/wow response. Defensive: unknown shapes yield nothing. */
export function linksFromWowProfile(profile: unknown, region: WowRegion): LinkDraft[] {
  const accounts = (profile as { wow_accounts?: unknown })?.wow_accounts;
  if (!Array.isArray(accounts)) return [];
  const out: LinkDraft[] = [];
  for (const account of accounts) {
    const chars = (account as { characters?: unknown })?.characters;
    if (!Array.isArray(chars)) continue;
    for (const c of chars) {
      const name = c?.name;
      const realm = c?.realm;
      if (typeof name !== "string" || typeof realm?.slug !== "string") continue;
      out.push({
        provider: "wow",
        accountId: `${region}:${realm.slug}:${name.toLowerCase()}`,
        displayName: name.slice(0, 50),
        verified: true,
        details: {
          level: typeof c.level === "number" ? c.level : null,
          className: typeof c.playable_class?.name === "string" ? c.playable_class.name : null,
          realm: typeof realm.name === "string" ? realm.name : realm.slug,
          faction: typeof c.faction?.name === "string" ? c.faction.name : null,
          region,
        },
      });
    }
  }
  // Highest level first, capped so a huge account can't flood a roster.
  return out
    .sort((a, b) => Number(b.details.level ?? 0) - Number(a.details.level ?? 0))
    .slice(0, 50);
}
