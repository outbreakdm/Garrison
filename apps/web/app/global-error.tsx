"use client";

import "@garrison/brand/css/tokens.css";
import "@garrison/brand/css/components.css";
import "./app.css";
import { LoadError } from "@/components/LoadError";

/** The root layout itself failed: this replaces the whole document, so it brings its own. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Couldn't load · Garrison</title>
        <main className="center">
          <LoadError error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
