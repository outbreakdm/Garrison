"use client";

/** A background swatch's colours, set from script (the dashboard's CSP has no inline styles). */
export function BackgroundChip({ from, to }: { from: string; to: string }) {
  return (
    <span
      className="swatch__chip"
      aria-hidden="true"
      ref={(el) => {
        el?.style.setProperty("--rc-from", from);
        el?.style.setProperty("--rc-to", to);
      }}
    />
  );
}
