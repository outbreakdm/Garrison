import type { CaseAction } from "@garrison/db";

const TONE: Record<CaseAction, string> = {
  warn: "g-badge--caution",
  timeout: "g-badge--caution",
  kick: "g-badge--alert",
  ban: "g-badge--alert",
  purge: "g-badge--intel",
};

export function ActionBadge({ action }: { action: CaseAction }) {
  return <span className={`g-badge ${TONE[action]}`}>{action}</span>;
}

/** "Thu Nov 12, 8:00 PM CST" in the event's own time zone. */
export function formatTime(date: Date, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatDuration(seconds: number | null) {
  if (!seconds) return "";
  if (seconds % 86_400 === 0) return `${seconds / 86_400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  return `${Math.round(seconds / 60)} min`;
}

/** Stored text can hold Discord mentions; the dashboard has no names for them, so say what kind each is. */
export function plainMentions(text: string) {
  return text
    .replace(/<@&\d+>/g, "a role")
    .replace(/<#\d+>/g, "a channel")
    .replace(/<@!?\d+>/g, "a member");
}
