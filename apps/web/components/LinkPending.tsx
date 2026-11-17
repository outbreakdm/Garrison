"use client";

import { useLinkStatus } from "next/link";

/**
 * Inside a Link whose page can take a moment (a library tile opening its editor): a thin bar
 * runs along the foot of the link while the page is on its way. It waits a beat before it
 * shows (console.css), so a fast answer never flickers it.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span className="link-pending" data-pending={pending ? "" : undefined} aria-hidden="true" />
  );
}
