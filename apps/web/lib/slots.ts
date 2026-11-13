/** Role slots (Tank 2, Healer 4) between the stored text and the form's rows. */

export interface Slot {
  name: string;
  count: string;
}

/** "Tank 2, Healer 4" as stored, read back into rows for the form. */
export function slotsFromText(text: string | null | undefined): Slot[] {
  return (text ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(\d+)\s*x?\s+(.+)$/i) ?? p.match(/^(.+?)\s+x?(\d+)$/i);
      if (!m) return { name: p, count: "1" };
      return /^\d/.test(p)
        ? { name: m[2] ?? "", count: m[1] ?? "1" }
        : { name: m[1] ?? "", count: m[2] ?? "1" };
    });
}

/** Server side: the slot rows back into the "Tank 2, Healer 4" text the parser reads. */
export function slotsText(form: FormData): string | null {
  const names = form.getAll("slotName").map((v) => String(v).trim());
  if (!names.length) return null;
  const counts = form.getAll("slotCount").map((v) => String(v).trim());
  return names
    .map((n, i) => (n ? `${n} ${counts[i] || "1"}` : ""))
    .filter(Boolean)
    .join(", ");
}
