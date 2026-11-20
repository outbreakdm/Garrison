/**
 * A server's public page (best bot item 9): garrisonbot.com/s/<name or ID>, off until the
 * owner turns it on. It shows the server's name, icon and member count, a short About, an
 * invite button if one is given, and, when allowed, the leveling leaderboard (names, levels
 * and XP). Nothing else about the server or its members is public. Pure and shared.
 *
 * Free: the page at /s/<server ID>, the top 25. Pro: a name of its own (/s/raid-team), the top 100.
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export interface PublicPage {
  publicPage: boolean;
  publicLeaderboard: boolean;
  /** Pro: the page's own name in its address. Lower case, 3 to 32 letters, numbers and -. */
  publicSlug: string | null;
  publicAbout: string | null;
  /** An invite code (from discord.gg/<code>), for the Join button. */
  publicInvite: string | null;
}

export const PUBLIC_ABOUT_MAX = 300;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const INVITE = /^[A-Za-z0-9-]{2,32}$/;
/** Names that would read as Garrison's own pages, or mislead. */
const RESERVED = new Set([
  "admin",
  "api",
  "app",
  "dashboard",
  "discord",
  "garrison",
  "garrisonbot",
  "help",
  "login",
  "official",
  "staff",
  "status",
  "support",
]);

export const publicBoardSize = (ent: Entitlements) => (ent["members.publicSlug"] ? 100 : 25);

/** An invite as typed: a bare code, discord.gg/<code> or discord.com/invite/<code>. */
export function publicInviteCode(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m =
    /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([^/?#\s]+)\/?$/i.exec(
      s,
    );
  const code = m?.[1] ?? s;
  return INVITE.test(code) ? code : null;
}

/** The public page's settings, checked. A name already saved stays when the server is back on Free. */
export function checkPublicPage(
  raw: {
    publicPage?: unknown;
    publicLeaderboard?: unknown;
    publicSlug?: unknown;
    publicAbout?: unknown;
    publicInvite?: unknown;
  },
  ent: Entitlements,
  before: Pick<PublicPage, "publicSlug">,
): Parsed<PublicPage> {
  const slugText = typeof raw.publicSlug === "string" ? raw.publicSlug.trim().toLowerCase() : "";
  let publicSlug: string | null = null;
  if (slugText) {
    if (!SLUG.test(slugText))
      return {
        ok: false,
        error: "The page's name is 3 to 32 lower-case letters, numbers and dashes.",
      };
    if (RESERVED.has(slugText) || /^\d+$/.test(slugText))
      return { ok: false, error: "That name is taken. Try another." };
    if (!ent["members.publicSlug"] && slugText !== before.publicSlug)
      return { ok: false, error: "A name of its own for the page is part of Garrison Pro." };
    publicSlug = slugText;
  }
  const about =
    typeof raw.publicAbout === "string" ? raw.publicAbout.trim().replace(/\r\n/g, "\n") : "";
  if (about.length > PUBLIC_ABOUT_MAX)
    return { ok: false, error: `The About text holds ${PUBLIC_ABOUT_MAX} characters.` };
  if (/@(everyone|here)\b/.test(about))
    return { ok: false, error: "The About text can't mention @everyone or @here." };
  const inviteText = typeof raw.publicInvite === "string" ? raw.publicInvite : "";
  const publicInvite = publicInviteCode(inviteText);
  if (inviteText.trim() && !publicInvite)
    return { ok: false, error: "That isn't a Discord invite. Paste a discord.gg link." };
  return {
    ok: true,
    value: {
      publicPage: raw.publicPage === true,
      publicLeaderboard: raw.publicLeaderboard === true,
      publicSlug,
      publicAbout: about || null,
      publicInvite,
    },
  };
}
