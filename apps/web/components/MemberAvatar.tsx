/** A member's Discord avatar, or their initial on a plate when they have none. */
export function MemberAvatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src: string | null;
  size?: "md" | "lg";
}) {
  const cls = `avatar avatar--${size}`;
  if (src)
    return (
      // biome-ignore lint/performance/noImgElement: a remote Discord avatar, already sized by its URL
      <img
        className={cls}
        src={src}
        alt=""
        width={size === "lg" ? 56 : 32}
        height={size === "lg" ? 56 : 32}
      />
    );
  return (
    <span className={cls} aria-hidden="true">
      {(name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase()}
    </span>
  );
}
