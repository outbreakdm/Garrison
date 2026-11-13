/**
 * Time drawn to scale: a bar whose filled length is the real share of a span (a
 * ticket's wait against two days, a raid's countdown against a week, a lockdown's
 * time served against its length), with the same span said in words beside it.
 */
export function DurationBar({
  value,
  max,
  label,
  text,
  tone,
}: {
  value: number;
  max: number;
  label: string;
  text: string;
  tone?: "caution" | "alert";
}) {
  const v = Math.max(0, Math.min(value, max));
  return (
    <span className="duration">
      <progress
        className={`xpbar duration__bar${tone ? ` duration__bar--${tone}` : ""}`}
        value={v}
        max={max}
        aria-label={label}
      />
      <span className="duration__text mono">{text}</span>
    </span>
  );
}

/** "in 40 min", "in 5 h", "in 3 d": short, server-rendered. */
export function untilText(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `in ${m} min`;
  if (m < 2_880) return `in ${Math.round(m / 60)} h`;
  return `in ${Math.round(m / 1_440)} d`;
}
