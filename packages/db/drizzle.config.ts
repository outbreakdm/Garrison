import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "drizzle-kit";

/**
 * `pnpm db:migrate` runs in packages/db, but the .env lives at the repo root
 * (as the bot's scripts read it). Values already set in the shell win.
 * Windows editors and PowerShell's `>` often save it as UTF-16 or with a byte
 * order mark, which Node's own .env loader can't read, so decode it here.
 */
function loadRootEnv(file: string) {
  if (!existsSync(file)) return;
  const bytes = readFileSync(file);
  const text =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? bytes.subarray(2).toString("utf16le")
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? Buffer.from(bytes.subarray(2)).swap16().toString("utf16le")
        : bytes.toString("utf8").replace(/^﻿/, "");
  for (const [key, value] of Object.entries(parseEnv(text))) process.env[key] ??= value;
}

const rootEnv = resolve(process.cwd(), "../../.env");
loadRootEnv(rootEnv);

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? "";
const command = process.argv.slice(2).join(" ");
if (!url && /\b(migrate|push|pull|studio|check)\b/.test(command)) {
  const txt = existsSync(`${rootEnv}.txt`) ? ` Found ${rootEnv}.txt: rename it to .env.` : "";
  throw new Error(
    `DATABASE_MIGRATION_URL isn't set. Put it in ${rootEnv}, or set it in this shell ` +
      `(PowerShell: $env:DATABASE_MIGRATION_URL = '...').${txt}`,
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    // Use the direct (non-pooled) connection string for migrations.
    url,
  },
});
