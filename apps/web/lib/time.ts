/**
 * Times the way people say them: "5 min ago", "in 3 h", "2 d ago", and a date
 * once it's more than two weeks away. Pure, so it's unit tested.
 */
export function relativeTime(date: Date, now = new Date()): string {
  const ms = date.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "just now";
  const say = (n: number, unit: string) => (ms < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`);
  if (minutes < 60) return say(minutes, "min");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return say(hours, "h");
  const days = Math.round(hours / 24);
  if (days <= 14) return say(days, "d");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(date.getUTCFullYear() === now.getUTCFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}
