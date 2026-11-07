import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/deploy-commands.ts", "src/preflight.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Bundle workspace packages (they ship TypeScript source); keep npm deps external.
  noExternal: [/^@garrison\//],
});
