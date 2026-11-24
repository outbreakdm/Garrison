/**
 * Raid signup styles. Simple: first come, first served by role, a full role benches you.
 * Organized: members answer whether they're coming and with which character, and officers
 * pick the lineup. Pure and shared by the bot, the dashboard and the player page.
 */

export const RAID_STYLES = ["simple", "organized"] as const;
export type RaidStyle = (typeof RAID_STYLES)[number];
export const isRaidStyle = (v: unknown): v is RaidStyle =>
  typeof v === "string" && (RAID_STYLES as readonly string[]).includes(v);

export const AVAILABILITY = ["coming", "tentative", "late", "cant"] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const isAvailability = (v: unknown): v is Availability =>
  typeof v === "string" && (AVAILABILITY as readonly string[]).includes(v);

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  coming: "Coming",
  tentative: "Tentative",
  late: "Late",
  cant: "Can't",
};

/** The raid role a character's role fills ("healer" → "Healer"), or null when the raid has none. */
export function slotFor<T extends { name: string }>(slots: T[], role: string | null | undefined) {
  if (!role) return null;
  const want = role.trim().toLowerCase();
  return slots.find((s) => s.name.toLowerCase() === want)?.name ?? null;
}
