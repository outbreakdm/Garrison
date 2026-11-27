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

/**
 * The versions of WoW whose characters Battle.net can list, by Blizzard API namespace.
 * WoW Forever's namespace isn't in Blizzard's docs yet, but its account list answers the
 * same way: Blizzard lists the characters on the signed-in account, so each one is proven.
 */
export const WOW_FLAVORS = {
  retail: { label: "Retail", namespace: "profile" },
  classic: { label: "Classic", namespace: "profile-classic" },
  era: { label: "Classic Era", namespace: "profile-classic1x" },
  forever: { label: "Forever", namespace: "profile-forever" },
} as const;
export type WowFlavor = keyof typeof WOW_FLAVORS;
export const isWowFlavor = (f: unknown): f is WowFlavor =>
  typeof f === "string" && Object.hasOwn(WOW_FLAVORS, f);

/**
 * The start of every account ID one Battle.net link writes, so relinking one version and
 * region replaces only those characters. Retail keeps the original "us:realm:name" form.
 */
export const wowAccountPrefix = (region: WowRegion, flavor: WowFlavor) =>
  flavor === "retail" ? `${region}:` : `${flavor}:${region}:`;

/** Characters from Blizzard's /profile/user/wow response. Defensive: unknown shapes yield nothing. */
export function linksFromWowProfile(
  profile: unknown,
  region: WowRegion,
  flavor: WowFlavor = "retail",
): LinkDraft[] {
  const accounts = (profile as { wow_accounts?: unknown })?.wow_accounts;
  if (!Array.isArray(accounts)) return [];
  const out: LinkDraft[] = [];
  for (const account of accounts) {
    const chars = (account as { characters?: unknown })?.characters;
    if (!Array.isArray(chars)) continue;
    for (const c of chars) {
      const name = c?.name;
      if (typeof name !== "string" || !name) continue;
      let key: string;
      let displayName = name;
      let realmName: string | null = null;
      if (flavor === "forever") {
        // Forever has no realms: a character is a first name and a surname, unique per region.
        const surname = typeof c.surname === "string" && c.surname ? c.surname : null;
        if (surname) displayName = `${name} ${surname}`;
        key = [name, surname].filter(Boolean).join("-").toLowerCase();
      } else {
        const realm = c?.realm;
        if (typeof realm?.slug !== "string") continue;
        key = `${realm.slug}:${name.toLowerCase()}`;
        realmName = typeof realm.name === "string" ? realm.name : realm.slug;
      }
      out.push({
        provider: "wow",
        accountId: `${wowAccountPrefix(region, flavor)}${key}`,
        displayName: displayName.slice(0, 50),
        verified: true,
        details: {
          level: typeof c.level === "number" ? c.level : null,
          className: typeof c.playable_class?.name === "string" ? c.playable_class.name : null,
          realm: realmName,
          faction: typeof c.faction?.name === "string" ? c.faction.name : null,
          region,
          flavor,
        },
      });
    }
  }
  // Highest level first, capped so a huge account can't flood a roster.
  return out
    .sort((a, b) => Number(b.details.level ?? 0) - Number(a.details.level ?? 0))
    .slice(0, 50);
}
