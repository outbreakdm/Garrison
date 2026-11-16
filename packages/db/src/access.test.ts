import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AccessGrant,
  atLeast,
  checkAccessGrants,
  grantedLevel,
  MANAGER_REQUEST_KINDS,
  readAccessGrants,
} from "./access";
import type { Db } from "./client";
import { getAccessGrants, listGuildIdsGrantedTo, listGuildIdsWithRoleGrants } from "./repo/access";
import { upsertGuild } from "./repo/guilds";
import { applySettingsChange, undoSettingsChange } from "./repo/settings";
import { createTestDb } from "./testing";

const KEL = "200000000000000002";
const ROOK = "200000000000000003";
const MODS = "300000000000000003";
const grant = (g: Partial<AccessGrant>): AccessGrant => ({
  kind: "user",
  id: KEL,
  level: "viewer",
  name: "Kel",
  ...g,
});

describe("access rules", () => {
  it("ranks viewer below editor below manager", () => {
    expect(atLeast("manager", "editor")).toBe(true);
    expect(atLeast("editor", "editor")).toBe(true);
    expect(atLeast("viewer", "editor")).toBe(false);
    expect(atLeast("editor", "manager")).toBe(false);
  });

  it("gives the highest level that applies, by name or by role, and nothing otherwise", () => {
    const grants = [grant({}), grant({ kind: "role", id: MODS, level: "editor", name: "Mods" })];
    expect(grantedLevel(grants, KEL, [])).toBe("viewer");
    expect(grantedLevel(grants, KEL, [MODS])).toBe("editor");
    expect(grantedLevel(grants, ROOK, [MODS])).toBe("editor");
    expect(grantedLevel(grants, ROOK, [])).toBeNull();
  });

  it("checks a list whole: shapes, levels, duplicates and size", () => {
    expect(checkAccessGrants([grant({})])).toMatchObject({ ok: true });
    expect(checkAccessGrants([grant({ level: "owner" as never })])).toMatchObject({ ok: false });
    expect(checkAccessGrants([grant({ id: "not-an-id" })])).toMatchObject({ ok: false });
    expect(checkAccessGrants([grant({}), grant({ level: "editor" })])).toMatchObject({ ok: false });
    const many = Array.from({ length: 26 }, (_, i) => grant({ id: `2000000000000000${10 + i}` }));
    expect(checkAccessGrants(many)).toMatchObject({ ok: false });
    expect(readAccessGrants([{ kind: "user", id: KEL }, "junk", grant({})])).toHaveLength(1);
  });

  it("keeps acting on members and the server's structure for managers", () => {
    for (const k of [
      "mod_action",
      "purge",
      "lockdown_start",
      "backup_restore",
      "qm_apply",
      "verify_decide",
    ])
      expect(MANAGER_REQUEST_KINDS.has(k), k).toBe(true);
    for (const k of ["post_message", "start_giveaway", "qm_chat", "ticket_action"])
      expect(MANAGER_REQUEST_KINDS.has(k), k).toBe(false);
  });
});

let db: Db;
let exec: (sql: string) => Promise<unknown>;
let close: () => Promise<void>;
const G = "950000000000000001";
const H = "950000000000000002";
const taner = { userId: "100000000000000001", username: "taner" };

beforeAll(async () => {
  ({ db, exec, close } = await createTestDb());
  await exec("SET ROLE garrison_bot");
  await upsertGuild(db, { id: G, name: "Scapewatch" });
  await upsertGuild(db, { id: H, name: "Other" });
  await exec("RESET ROLE");
  await exec("SET ROLE garrison_web");
});
afterAll(() => close());

describe("dashboard access, as garrison_web", () => {
  it("saves grants with history, finds servers that name a user or use roles", async () => {
    expect(await getAccessGrants(db, G)).toEqual([]);
    const first = await applySettingsChange(db, {
      guildId: G,
      module: "access",
      patch: { grants: [grant({}), grant({ kind: "role", id: MODS, name: "Mods" })] },
      ...taner,
    });
    expect(first).toMatchObject({ ok: true, change: { module: "access" } });
    expect(await getAccessGrants(db, G)).toHaveLength(2);
    expect(await listGuildIdsGrantedTo(db, KEL)).toEqual([G]);
    expect(await listGuildIdsGrantedTo(db, ROOK)).toEqual([]);
    expect(await listGuildIdsWithRoleGrants(db, [G, H])).toEqual([G]);
  });

  it("lets only someone allowed to change access undo a change to it", async () => {
    const change = await applySettingsChange(db, {
      guildId: G,
      module: "access",
      patch: { grants: [] },
      ...taner,
    });
    if (!change.ok) throw new Error("unreachable");
    expect(await undoSettingsChange(db, G, change.change.id, taner, ["access"])).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await undoSettingsChange(db, G, change.change.id, taner)).toMatchObject({ ok: true });
    expect(await getAccessGrants(db, G)).toHaveLength(2);
  });

  it("holds the list to 25 in the database too", async () => {
    const many = Array.from({ length: 26 }, (_, i) => grant({ id: `2000000000000000${10 + i}` }));
    await expect(
      applySettingsChange(db, { guildId: H, module: "access", patch: { grants: many }, ...taner }),
    ).rejects.toThrow();
  });

  it("lets the bot read the list, to re-check an editor's requests, but never change it", async () => {
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_bot");
    expect(await getAccessGrants(db, G)).toHaveLength(2);
    const err = await applySettingsChange(db, {
      guildId: G,
      module: "access",
      patch: { grants: [] },
      ...taner,
    }).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(err, "the bot should be refused").toMatch(/permission denied/);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
  });
});
