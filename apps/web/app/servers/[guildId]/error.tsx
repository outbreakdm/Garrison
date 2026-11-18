"use client";

import { LoadError } from "@/components/LoadError";

/** A page that failed to render, inside the server's top bar and menu (they stay usable). */
export default function ServerPageError({ error, retry }: { error: unknown; retry: () => void }) {
  return <LoadError error={error} retry={retry} />;
}
