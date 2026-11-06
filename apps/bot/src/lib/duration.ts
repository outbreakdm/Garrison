const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  m: 60,
  min: 60,
  h: 3600,
  hr: 3600,
  d: 86_400,
  w: 604_800,
};

/**
 * Parse durations like "10m", "1h30m", "2d" or "1 h 30 min" into seconds.
 * Returns null for anything else, including bare numbers without a unit.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  const re = /(\d+)(sec|min|hr|[smhdw])/g;
  let total = 0;
  let consumed = 0;
  for (const match of text.matchAll(re)) {
    if (match.index !== consumed) return null;
    const [whole, amount, unit] = match;
    total += Number(amount) * (UNIT_SECONDS[unit as string] ?? 0);
    consumed += whole.length;
  }
  if (consumed !== text.length || total <= 0) return null;
  return total;
}

const PARTS: [number, string][] = [
  [86_400, "d"],
  [3600, "h"],
  [60, "min"],
  [1, "s"],
];

/** Format seconds the way Garrison writes them: "1 h", "1 h 30 min", "7 d". At most two parts. */
export function formatDuration(seconds: number): string {
  const out: string[] = [];
  let rest = Math.max(0, Math.round(seconds));
  for (const [size, label] of PARTS) {
    if (out.length === 2) break;
    const n = Math.floor(rest / size);
    if (n > 0) {
      out.push(`${n} ${label}`);
      rest -= n * size;
    } else if (out.length === 1) {
      break;
    }
  }
  return out.length ? out.join(" ") : "0 s";
}

/** Discord caps timeouts at 28 days. */
export const MAX_TIMEOUT_SECONDS = 28 * 86_400;
