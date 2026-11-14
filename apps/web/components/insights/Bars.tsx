/**
 * A bar chart drawn as SVG, no script and no inline styles (the CSP forbids them):
 * geometry is attributes, color is CSS (.chart__bar, .chart__bar--down). Each column has a
 * full-height hit area with a native tooltip. `down` draws a second series below the
 * baseline (leaves under joins), so both read against one axis.
 */

export interface Bar {
  /** Tooltip text for the whole column; unique per bar (it names the day or hour). */
  title: string;
  value: number;
  down?: number;
}

const W = 600;

export function Bars({
  bars,
  height = 140,
  label,
  axis,
}: {
  bars: Bar[];
  height?: number;
  /** Accessible name for the chart. */
  label: string;
  /** Labels under the chart: first, middle, last. */
  axis: [string, string, string];
}) {
  const mirrored = bars.some((b) => (b.down ?? 0) > 0);
  const maxUp = Math.max(1, ...bars.map((b) => b.value));
  const maxDown = Math.max(1, ...bars.map((b) => b.down ?? 0));
  // Up and down share one scale so a tall leave and a tall join compare honestly.
  const max = mirrored ? Math.max(maxUp, maxDown) : maxUp;
  const base = mirrored ? height / 2 : height;
  const room = mirrored ? height / 2 - 2 : height - 2;
  const slot = W / Math.max(1, bars.length);
  const gap = Math.min(2, slot * 0.25);
  const width = Math.max(1, slot - gap);
  const scale = (v: number) => (v > 0 ? Math.max(2, (v / max) * room) : 0);

  return (
    <figure className="chart">
      <span className="chart__max">{max.toLocaleString("en-US")}</span>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        height={height}
      >
        <line className="chart__base" x1={0} x2={W} y1={base} y2={base} />
        {bars.map((b, i) => {
          const x = i * slot + gap / 2;
          const up = scale(b.value);
          const down = scale(b.down ?? 0);
          return (
            <g className="chart__col" key={b.title}>
              <title>{b.title}</title>
              <rect className="chart__hit" x={i * slot} y={0} width={slot} height={height} />
              {up ? (
                <rect className="chart__bar" x={x} y={base - up} width={width} height={up} />
              ) : null}
              {down ? (
                <rect
                  className="chart__bar chart__bar--down"
                  x={x}
                  y={base}
                  width={width}
                  height={down}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="chart__axis">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
        <span>{axis[2]}</span>
      </figcaption>
    </figure>
  );
}
