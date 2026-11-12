import { defineConfig } from "vitest/config";

export default defineConfig({
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
