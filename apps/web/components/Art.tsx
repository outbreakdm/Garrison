import generated from "@/lib/art.generated.json";

/**
 * A picture from apps/web/public/art, by slot name. Slots, sizes and prompts
 * are listed in apps/web/art/slots.json; `pnpm art` records which files exist.
 * A slot with no file renders nothing, so pages never show a broken image.
 */

interface Piece {
  src: string;
  width: number;
  height: number;
  alt: string;
}

const ART: Record<string, Piece | undefined> = generated;

export const hasArt = (slot: string) => Boolean(ART[slot]);
export const artSrc = (slot: string) => ART[slot]?.src;

export function Art({
  slot,
  className = "",
  decorative = false,
  eager = false,
}: {
  slot: string;
  className?: string;
  /** Hidden from screen readers: the picture only repeats what the text says. */
  decorative?: boolean;
  /** Load straight away: for pictures visible when the page opens. */
  eager?: boolean;
}) {
  const piece = ART[slot];
  if (!piece) return null;
  return (
    // biome-ignore lint/performance/noImgElement: served as-is from /art; no image optimiser on Cloudflare
    <img
      className={`art ${className}`.trim()}
      src={piece.src}
      width={piece.width}
      height={piece.height}
      alt={decorative ? "" : piece.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
