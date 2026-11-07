import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createCase } from "./repo/cases";
import { upsertGuild } from "./repo/guilds";
import { awardXp } from "./repo/ranks";
import { cleanQuery, likeEscape, searchCases, searchMembers } from "./repo/search";
import { createTestDb } from "./testing";

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "960";
const OTHER = "961";
const KEL = "100000000000000007";

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
  await upsertGuild(db, { id: OTHER, name: "Elsewhere" });
  const base = { moderatorId: "1", moderatorTag: "taner" };
  await createCase(db, {
    guildId: G,
    action: "warn",
    targetId: KEL,
    targetTag: "kel",
    reason: "100% spam",
    ...base,
  });
  await createCase(db, {
    guildId: G,
    action: "timeout",
    targetId: KEL,
    targetTag: "kel",
    reason: "raid_chat",
    durationSeconds: 60,
    ...base,
  });
  await createCase(db, {
    guildId: OTHER,
    action: "ban",
    targetId: "100000000000000009",
    targetTag: "kelvin",
    reason: "x",
    ...base,
  });
  await awardXp(db, G, { id: "100000000000000008", username: "Mira" }, 50, 0);
  await exec("RESET ROLE");
  await exec("SET ROLE garrison_web");
});
afterAll(() => close());

describe("dashboard search, as garrison_web", () => {
  it("finds cases by number, member and reason, in this server only", async () => {
    expect((await searchCases(db, G, "#2")).map((c) => c.caseNumber)).toEqual([2]);
    expect((await searchCases(db, G, "kel")).length).toBe(2);
    expect(await searchCases(db, G, KEL)).toHaveLength(2);
    expect(await searchCases(db, G, "kelvin")).toHaveLength(0);
  });

  it("treats LIKE wildcards literally", async () => {
    expect(likeEscape("a%b_c\\")).toBe("a\\%b\\_c\\\\");
    expect(await searchCases(db, G, "%")).toHaveLength(1); // only "100% spam"
    expect(await searchCases(db, G, "_")).toHaveLength(1); // only "raid_chat"
  });

  it("finds members by name or ID from XP and cases", async () => {
    expect((await searchMembers(db, G, "mi")).map((m) => m.name)).toEqual(["Mira"]);
    expect(await searchMembers(db, G, "KEL")).toEqual([{ userId: KEL, name: "kel", level: null }]);
    expect(await searchMembers(db, OTHER, "mira")).toEqual([]);
  });

  it("bounds the query", () => {
    expect(cleanQuery("  ")).toBeNull();
    expect(cleanQuery(["a"])).toBeNull();
    expect(cleanQuery("x".repeat(200))).toHaveLength(64);
  });
});
