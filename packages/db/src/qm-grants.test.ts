import { getTableColumns, getTableName } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QM_SETTINGS } from "./qm-settings";
import { SETTINGS_TABLES } from "./repo/settings";
import { createTestDb } from "./testing";

/**
 * The AI assistant applies a plan from the bot, through the same applySettingsChange the
 * dashboard uses: every setting it may change must be a column the bot can write. (Rally's
 * templates and the economy were readable only until 0093 and 0094, so those plans failed when
 * they were applied.) Fields kept in other tables (the warning ladder, level rewards) are
 * written by their own repo functions and checked by their own tests.
 */
describe("the AI assistant's settings, under the bot's grants", () => {
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ exec, close } = await createTestDb());
  });
  afterAll(() => close());

  it("lets the bot insert and update every column a plan may change", async () => {
    const missing: string[] = [];
    for (const [module, spec] of Object.entries(QM_SETTINGS)) {
      const table = SETTINGS_TABLES[module as keyof typeof SETTINGS_TABLES];
      if (!table) continue;
      const columns = getTableColumns(table) as Record<string, { name: string }>;
      const name = getTableName(table);
      for (const field of Object.keys(spec.fields)) {
        const column = columns[field]?.name;
        if (!column) continue;
        const out = (await exec(
          `SELECT has_column_privilege('garrison_bot', 'public.${name}', '${column}', 'UPDATE') AS u, has_column_privilege('garrison_bot', 'public.${name}', '${column}', 'INSERT') AS i`,
        )) as { rows: { u: boolean; i: boolean }[] }[];
        const r = out[0]?.rows[0];
        if (!r?.u || !r?.i) missing.push(`${module}.${field} (${name}.${column})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
