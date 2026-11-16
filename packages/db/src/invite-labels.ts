/**
 * Invite tracker: labels on a server's invites (the ones Garrison sees in the server, Disboard's
 * and social-link invites included). A label names an invite and can give a color, a note, a
 * category ("Socials", "Partners", "Ads") and a role for everyone who joins with it. Invites in
 * the Partners category carry the partner server's details. Pure and shared.
 *
 * Free: 10 labelled invites. Pro: 100.
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";

export interface PartnerDetails {
  /** The partner server's name. */
  server: string;
  /** Who to talk to there. */
  contact: string | null;
  /** What the partnership is: what each side posts, when it renews. */
  note: string | null;
}

export interface InviteLabel {
  code: string;
  name: string;
  /** #rrggbb, or null for the standard color. */
  color: string | null;
  description: string | null;
  category: string | null;
  /** Given to everyone who joins with this invite. */
  roleId: string | null;
  partner: PartnerDetails | null;
}

export const PARTNERS = "Partners";
export const SUGGESTED_CATEGORIES = ["Socials", PARTNERS, "Ads", "Listings", "Staff"] as const;

export const INVITE_LIMITS = {
  labels: 100,
  name: 40,
  description: 200,
  category: 30,
  server: 60,
  contact: 60,
  note: 300,
} as const;

const CODE = /^[A-Za-z0-9-]{2,32}$/;
const SNOWFLAKE = /^\d{17,20}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** An invite code from a pasted link (discord.gg/…, discord.com/invite/…) or the code itself. */
export function inviteCode(text: string): string | null {
  const t = text.trim();
  if (CODE.test(t)) return t;
  const m =
    /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/i.exec(
      t,
    );
  return m?.[1] ?? null;
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function readPartner(raw: unknown): PartnerDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const server = text(p.server, INVITE_LIMITS.server);
  if (!server) return null;
  return {
    server,
    contact: text(p.contact, INVITE_LIMITS.contact),
    note: text(p.note, INVITE_LIMITS.note),
  };
}

/** A stored list, read leniently: a label without a valid code or name is left out. */
export function readInviteLabels(raw: unknown): InviteLabel[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InviteLabel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const code = typeof l.code === "string" && CODE.test(l.code) ? l.code : null;
    const name = text(l.name, INVITE_LIMITS.name);
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    const category = text(l.category, INVITE_LIMITS.category);
    out.push({
      code,
      name,
      color: typeof l.color === "string" && HEX.test(l.color) ? l.color.toLowerCase() : null,
      description: text(l.description, INVITE_LIMITS.description),
      category,
      roleId: typeof l.roleId === "string" && SNOWFLAKE.test(l.roleId) ? l.roleId : null,
      partner: category === PARTNERS ? readPartner(l.partner) : null,
    });
  }
  return out.slice(0, INVITE_LIMITS.labels);
}

/**
 * Check the list from the dashboard. `before` is what's saved: a server back on Free keeps
 * the labels it made on Pro, but adds none past the Free limit. Codes, roles and channels
 * belonging to the server are checked by the caller.
 */
export function checkInviteLabels(
  raw: unknown,
  ent: Entitlements,
  before: InviteLabel[],
): Parsed<InviteLabel[]> {
  const list = Array.isArray(raw) ? raw : [];
  const out: InviteLabel[] = [];
  const codes = new Set<string>();
  for (const [i, item] of list.entries()) {
    const l = (item ?? {}) as Record<string, unknown>;
    const code = typeof l.code === "string" ? l.code.trim() : "";
    if (!CODE.test(code)) return { ok: false, error: `Invite ${i + 1} has no valid code.` };
    if (codes.has(code)) return { ok: false, error: `${code} is labelled twice.` };
    codes.add(code);
    const name = typeof l.name === "string" ? l.name.trim() : "";
    if (!name) return { ok: false, error: `Give ${code} a name.` };
    if (name.length > INVITE_LIMITS.name)
      return { ok: false, error: `Names hold ${INVITE_LIMITS.name} characters.` };
    const color = typeof l.color === "string" && l.color ? l.color.trim().toLowerCase() : null;
    if (color && !HEX.test(color)) return { ok: false, error: `${name}: pick a color.` };
    const description = typeof l.description === "string" ? l.description.trim() : "";
    if (description.length > INVITE_LIMITS.description)
      return {
        ok: false,
        error: `${name}: descriptions hold ${INVITE_LIMITS.description} characters.`,
      };
    const category = typeof l.category === "string" ? l.category.trim() : "";
    if (category.length > INVITE_LIMITS.category)
      return { ok: false, error: `${name}: categories hold ${INVITE_LIMITS.category} characters.` };
    const roleId = typeof l.roleId === "string" && l.roleId ? l.roleId : null;
    if (roleId && !SNOWFLAKE.test(roleId))
      return { ok: false, error: `${name}: pick the role from this server's list.` };
    let partner: PartnerDetails | null = null;
    if (category === PARTNERS && l.partner && typeof l.partner === "object") {
      const p = l.partner as Record<string, unknown>;
      const server = typeof p.server === "string" ? p.server.trim() : "";
      const contact = typeof p.contact === "string" ? p.contact.trim() : "";
      const note = typeof p.note === "string" ? p.note.trim() : "";
      if (
        server.length > INVITE_LIMITS.server ||
        contact.length > INVITE_LIMITS.contact ||
        note.length > INVITE_LIMITS.note
      )
        return { ok: false, error: `${name}: the partner details are too long.` };
      partner = server ? { server, contact: contact || null, note: note || null } : null;
    }
    out.push({
      code,
      name,
      color,
      description: description || null,
      category: category || null,
      roleId,
      partner,
    });
  }
  if (out.length > INVITE_LIMITS.labels)
    return { ok: false, error: `Up to ${INVITE_LIMITS.labels} labelled invites.` };
  const max = ent["invites.labels"];
  if (out.length > max && out.length > before.length)
    return {
      ok: false,
      error: `Free servers label ${max} invites. Garrison Pro labels up to ${INVITE_LIMITS.labels}.`,
    };
  return { ok: true, value: out };
}

/** The categories in use, in first-seen order, for filters and the summary. */
export function inviteCategories(labels: InviteLabel[]): string[] {
  return [...new Set(labels.map((l) => l.category).filter((c): c is string => Boolean(c)))];
}
