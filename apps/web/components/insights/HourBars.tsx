"use client";

import { useEffect, useState } from "react";
import { Bars } from "./Bars";

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Messages by hour of day. Counts are stored by UTC hour; once in the browser the bars
 * turn to the reader's own clock (whole-hour zones exactly; half-hour zones round).
 */
export function HourBars({ utc }: { utc: number[] }) {
  const [shift, setShift] = useState<number | null>(null);
  useEffect(() => setShift(Math.round(-new Date().getTimezoneOffset() / 60)), []);
  const offset = shift ?? 0;
  const local = Array.from({ length: 24 }, (_, h) => utc[(((h - offset) % 24) + 24) % 24] ?? 0);
  const zone = shift === null ? "UTC" : "your time";
  return (
    <Bars
      label={`Messages by hour of day, ${zone}`}
      height={110}
      bars={local.map((value, h) => ({
        value,
        title: `${hourLabel(h)} ${zone}: ${value.toLocaleString("en-US")} messages`,
      }))}
      axis={[hourLabel(0), `${hourLabel(12)} (${zone})`, hourLabel(23)]}
    />
  );
}
