"use client";

import { LoadError } from "@/components/LoadError";

/**
 * Anything below the root layout that failed to render, including a server's own layout (its
 * access check asks Discord, which can rate limit): a card in the middle, with Try again.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="center">
      <LoadError error={error} retry={retry} />
    </main>
  );
}
