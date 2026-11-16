/**
 * The trend under a stat tile: the range folded into 12 points, a thin muted line, the
 * latest point in the page's section color. It repeats what the tile's words say, so
 * screen readers get one sentence instead of a drawing.
 */

const POINTS = 12;
const W = 120;
const H = 32;

/** Sum a daily series into `POINTS` buckets of (nearly) equal length. */
export function fold(values: number[], points = POINTS): number[] {
  if (values.length <= points) return values;
  return Array.from({ length: points }, (_, i) => {
    const from = Math.floor((i * values.length) / points);
    const to = Math.floor(((i + 1) * values.length) / points);
    return values.slice(from, to).reduce((s, v) => s + v, 0);
  });
}

/** The second half of a range against the first, as a whole percent; null when it can't say. */
export function halfDelta(values: number[]): number | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const before = values.slice(0, mid).reduce((s, v) => s + v, 0);
  const after = values.slice(values.length - mid).reduce((s, v) => s + v, 0);
  if (!before) return null;
  return Math.round(((after - before) / before) * 100);
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const pts = fold(values);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i): [number, number] => [
    (i / (pts.length - 1)) * (W - 6) + 3,
    H - 3 - ((v - min) / span) * (H - 6),
  ]);
  const [lx, ly] = xy.at(-1) ?? [0, 0];
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={label}
    >
      <polyline
        className="spark__line"
        points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="spark__now" cx={lx} cy={ly} r="3" />
    </svg>
  );
}
