import type { ReactNode } from "react";

/**
 * The rest of a page's intro, folded (docs/LAYOUT_PROPOSAL.md §4): the head says what the
 * module does in one sentence, and the detail is one click away instead of a paragraph.
 */
export function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <details className="how-works">
      <summary>How this works</summary>
      <p>{children}</p>
    </details>
  );
}
