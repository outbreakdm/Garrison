/**
 * Scam and phishing links: fake Nitro, Steam-gift and login pages, the most common attack
 * on gaming servers. Pure and shared. No list to fetch or keep fresh: it reads each link's
 * address and catches the three shapes these scams take.
 *
 * 1. A look-alike of a brand: steamcomrnunity, discorcl, dlscord, dicsord.
 * 2. A brand plus bait in someone else's address: discord-nitro.com, free-steam-gift.ru.
 * 3. An official address hidden at the front of another: discord.com.gift-claim.xyz.
 *
 * Official domains and ordinary sites that merely mention a brand (discord.js.org,
 * discordbotlist.com) are left alone.
 */

/** Domains that really are these companies'. */
const OFFICIAL = new Set([
  "discord.com",
  "discord.gg",
  "discord.gift",
  "discord.media",
  "discord.new",
  "discord.co",
  "discord.dev",
  "discordapp.com",
  "discordapp.net",
  "discordstatus.com",
  "steamcommunity.com",
  "steampowered.com",
  "steamstatic.com",
  "steamgames.com",
  "steam-chat.com",
  "valvesoftware.com",
  "epicgames.com",
  "unrealengine.com",
  "fortnite.com",
  "roblox.com",
  "twitch.tv",
  "riotgames.com",
  "leagueoflegends.com",
  "playvalorant.com",
  "battle.net",
  "blizzard.com",
]);

/** What scammers imitate, as they're spelled. */
const BRANDS = [
  "discord",
  "discordapp",
  "steamcommunity",
  "steampowered",
  "steam",
  "epicgames",
  "roblox",
  "twitch",
  "riotgames",
  "blizzard",
];

/** Words that turn "a site mentioning a brand" into "a scam using it". */
const BAIT =
  /gift|nitro|free|claim|giveaway|airdrop|promo|drop|reward|bonus|trade|login|verify|support|skin/;

/** Two-part endings where the registrable name is the third label from the right. */
const SECOND_LEVEL = new Set([
  "co.uk",
  "org.uk",
  "com.au",
  "com.br",
  "co.jp",
  "com.tr",
  "com.ru",
  "com.ua",
  "co.in",
  "com.pl",
]);

/** Fold the swaps look-alikes use, applied the same way to brands and addresses. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("rn", "m")
    .replaceAll("vv", "w")
    .replaceAll("cl", "d")
    .replace(/[0]/g, "o")
    .replace(/[1l|!]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

/** Edit distance with swaps of neighbours counted as one (dicsord is one from discord). */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const up = d[i - 1] as number[];
      row[j] = Math.min(
        (up[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (up[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1);
    }
  return (d[a.length] as number[])[b.length] as number;
}

/** The registrable domain: example.com from a.b.example.com, example.co.uk likewise. */
export function registrable(host: string): string {
  const labels = host.split(".").filter(Boolean);
  const two = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(two) ? labels.slice(-3).join(".") : two;
}

/** Hosts in a message: full links, masked [text](link) links and bare www. names. */
export function linkHosts(text: string): string[] {
  const hosts = new Set<string>();
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)([^\s/<>()[\]"'`?#]+)/gi)) {
    const raw = (m[0].toLowerCase().startsWith("www.") ? `www.${m[1]}` : m[1]) ?? "";
    const host = raw
      .toLowerCase()
      .replace(/^[^@]*@/, "")
      .replace(/:\d+$/, "")
      .replace(/\.+$/, "");
    if (host.includes(".")) hosts.add(host);
  }
  return [...hosts];
}

export interface ScamHit {
  host: string;
  /** Plain words for the case and the log. */
  why: string;
}

/** Why a host is a scam, or null. */
export function scamHost(host: string): ScamHit | null {
  const reg = registrable(host);
  if (OFFICIAL.has(reg)) return null;
  // 3. An official address at the front of someone else's: discord.com.gift-claim.xyz
  for (const o of OFFICIAL)
    if (host.startsWith(`${o}.`) || host.startsWith(`${o}-`) || host.includes(`.${o}-`))
      return { host, why: `pretends to be ${o}` };
  const name = reg.split(".")[0] ?? "";
  const pieces = [name, name.replaceAll("-", ""), ...name.split("-")].filter((p) => p.length >= 4);
  for (const brand of BRANDS) {
    const target = fold(brand);
    for (const piece of pieces) {
      const folded = fold(piece);
      // 1. A look-alike: spelled differently, reads the same (or one slip away).
      if (piece !== brand && folded === target) return { host, why: `imitates ${brand}` };
      const slack = brand.length >= 12 ? 2 : brand.length >= 7 ? 1 : 0;
      if (slack && piece !== brand && folded.length >= 6 && distance(folded, target) <= slack)
        return { host, why: `imitates ${brand}` };
    }
    // 2. The brand plus bait in an address that isn't theirs.
    if (name.includes(brand) && BAIT.test(name.replace(brand, "")))
      return { host, why: `uses the ${brand} name with "${name}"` };
  }
  return null;
}

/** The first scam link in a message, or null. */
export function findScamLink(text: string): ScamHit | null {
  for (const host of linkHosts(text)) {
    const hit = scamHost(host);
    if (hit) return hit;
  }
  return null;
}
