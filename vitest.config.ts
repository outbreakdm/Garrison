import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The dashboard's own import alias, for its component tests.
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) } },
  test: {
    include: [
      "apps/*/src/**/*.test.ts",
      "apps/web/lib/**/*.test.ts",
      "apps/web/components/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
    ],
    testTimeout: 20_000,
  },
});
