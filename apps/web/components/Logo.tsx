export function Logo() {
  return (
    <span className="g-logo">
      <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M58 20V12L52 6H12L6 12V38C6 50 18 56 32 61C46 56 58 50 58 38V34H33"
          fill="none"
          stroke="var(--accent-strong)"
          strokeWidth="6"
        />
      </svg>
      <span className="g-logo__word g-logo__word--sm">Garrison</span>
    </span>
  );
}
