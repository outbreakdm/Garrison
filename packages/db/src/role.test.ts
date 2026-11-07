import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { describeDbRole, roleProblem } from "./role";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
});
afterAll(() => close());

describe("database role guard", () => {
  it("accepts the least-privilege roles", async () => {
    await exec("SET ROLE garrison_bot");
    expect(roleProblem(await describeDbRole(db), "garrison_bot")).toBeNull();
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    expect(roleProblem(await describeDbRole(db), "garrison_web")).toBeNull();
    expect(roleProblem(await describeDbRole(db), "garrison_bot")).toMatch(/not garrison_bot/);
  });

  it("refuses a login that bypasses row-level security", async () => {
    await exec("RESET ROLE");
    const role = await describeDbRole(db);
    expect(role.superuser || role.bypassRls).toBe(true);
    expect(roleProblem(role, "garrison_bot")).toMatch(/bypasses row-level security/);
  });
});
