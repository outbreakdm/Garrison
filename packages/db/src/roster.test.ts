import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { checkGroups, defaultGroups, fillByRole, type Placement, slotFor } from "./raids";
import { upsertGuild } from "./repo/guilds";
import { listLineupLayouts, postLineup, saveLineup, saveLineupLayout } from "./repo/lineups";
import { answerRaid, createOpsEvent } from "./repo/ops";
import {
  addRosterCharacter,
  addRosterMember,
  createRosterTeam,
  deleteRosterTeam,
  listMemberTeams,
  listRosterCharacters,
  listRosterMembers,
  removeRosterCharacter,
  removeRosterMember,
  rosterAttendance,
  rosterCandidates,
  rosterGame,
  setMainCharacter,
  setRosterMember,
  updateRosterCharacter,
  updateRosterTeam,
} from "./repo/roster";
import {
  CHARACTERS_PER_MEMBER,
  checkCharacter,
  checkRosterNote,
  checkTeamName,
  describeCharacter,
} from "./roster";
import { opsSignups, rosterTeams } from "./schema";
import { createTestDb } from "./testing";

const G = "980000000000000021";
const KEL = { id: "980000000000000031", name: "kel" };
const ROOK = { id: "980000000000000032", name: "rook" };

const fields = (name: string, more: Partial<Record<string, string>> = {}) => {
  const r = checkCharacter({ name, ...more }, null);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("checking a character", () => {
  it("takes any class, spec and role for any game, and spells the standard roles one way", () => {
    expect(
      checkCharacter({ name: "  Mira  Vale ", className: "Ranger", role: "dps" }, null),
    ).toEqual({
      ok: true,
      value: { name: "Mira Vale", className: "Ranger", spec: null, role: "DPS" },
    });
    expect(checkCharacter({ name: "Zul'jin", role: "Shotcaller" }, null)).toMatchObject({
      ok: true,
      value: { role: "Shotcaller" },
    });
    expect(checkCharacter({ name: "" }, null).ok).toBe(false);
    expect(checkCharacter({ name: "<@everyone>" }, null).ok).toBe(false);
    expect(checkCharacter({ name: "Ok", className: "x".repeat(25) }, null).ok).toBe(false);
  });

  it("uses WoW's classes and specs, and the spec decides the role", () => {
    expect(
      checkCharacter({ name: "Thrall", className: "shaman", spec: "restoration" }, "wow"),
    ).toEqual({
      ok: true,
      value: { name: "Thrall", className: "Shaman", spec: "Restoration", role: "Healer" },
    });
    expect(
      checkCharacter({ name: "Varian", className: "Warrior", spec: "Protection" }, "wow"),
    ).toMatchObject({ value: { role: "Tank" } });
    expect(checkCharacter({ name: "X", className: "Bard" }, "wow")).toMatchObject({
      ok: false,
      error: "Bard isn't a class in World of Warcraft.",
    });
    expect(checkCharacter({ name: "X", className: "Mage", spec: "Holy" }, "wow")).toMatchObject({
      ok: false,
      error: "Holy isn't a Mage spec.",
    });
    expect(checkCharacter({ name: "X", spec: "Fire" }, "wow").ok).toBe(false);
    expect(
      describeCharacter(
        fields("Thrall", { className: "Shaman", spec: "Restoration", role: "Healer" }),
      ),
    ).toBe("Thrall · Restoration Shaman · Healer");
  });

  it("checks team names and notes", () => {
    expect(checkTeamName(" Main  raid ")).toEqual({ ok: true, value: "Main raid" });
    expect(checkTeamName("").ok).toBe(false);
    expect(checkRosterNote("  ")).toEqual({ ok: true, value: null });
    expect(checkRosterNote("x".repeat(301)).ok).toBe(false);
  });
});

describe("the roster", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("keeps Free servers to one team, and names unique", async () => {
    await exec("SET ROLE garrison_web");
    const main = await createRosterTeam(db, G, "free", { name: "Main raid", game: "wow" });
    expect(main).toMatchObject({ ok: true, value: { name: "Main raid", game: "wow" } });
    expect(await createRosterTeam(db, G, "free", { name: "Alts", game: null })).toMatchObject({
      ok: false,
      error: "Free servers have 1 roster team. Garrison Pro allows 10.",
    });
    expect(await createRosterTeam(db, G, "pro", { name: "main RAID", game: null })).toMatchObject({
      ok: false,
      error: "There's already a team called main RAID.",
    });
    const alts = await createRosterTeam(db, G, "pro", { name: "Alts", game: "nope" });
    expect(alts).toMatchObject({ ok: true, value: { game: null } });
    if (!alts.ok) return;
    expect(
      await updateRosterTeam(db, G, alts.value.id, { name: "Alt raid", game: null }),
    ).toMatchObject({
      ok: true,
      value: { name: "Alt raid" },
    });
    expect(await rosterGame(db, G)).toBe("wow");
    expect(await deleteRosterTeam(db, G, alts.value.id)).toBe(true);
    await exec("RESET ROLE");
  });

  it("makes the first character the main, and keeps one main per member", async () => {
    await exec("SET ROLE garrison_bot");
    const a = await addRosterCharacter(db, G, KEL, fields("Thrall"));
    const b = await addRosterCharacter(db, G, KEL, fields("Jaina"));
    expect(a).toMatchObject({ ok: true, value: { main: true } });
    expect(b).toMatchObject({ ok: true, value: { main: false } });
    expect(await addRosterCharacter(db, G, KEL, fields("thrall"))).toMatchObject({
      ok: false,
      error: "thrall is already on the roster.",
    });
    const c = await addRosterCharacter(db, G, { ...KEL, name: "kel2" }, fields("Anduin"), true);
    expect(c).toMatchObject({ ok: true, value: { main: true } });
    let mine = await listRosterCharacters(db, G, [KEL.id]);
    expect(mine.filter((x) => x.main).map((x) => x.name)).toEqual(["Anduin"]);
    expect(new Set(mine.map((x) => x.username))).toEqual(new Set(["kel2"]));
    if (!b.ok || !c.ok) return;
    // Only the member's own characters change when it's theirs asking.
    expect(await setMainCharacter(db, G, b.value.id, ROOK.id)).toBe(false);
    expect(await setMainCharacter(db, G, b.value.id, KEL.id)).toBe(true);
    // Removing the main hands it to their oldest other character.
    expect(await removeRosterCharacter(db, G, b.value.id, KEL.id)).toBe(true);
    mine = await listRosterCharacters(db, G, [KEL.id]);
    expect(mine.find((x) => x.main)?.name).toBe("Thrall");
    expect(
      await updateRosterCharacter(db, G, c.value.id, fields("Anduin", { role: "healer" }), KEL.id),
    ).toMatchObject({ ok: true, value: { role: "Healer" } });
    expect(await updateRosterCharacter(db, G, c.value.id, fields("Thrall"), KEL.id)).toMatchObject({
      ok: false,
    });
    await exec("RESET ROLE");
  });

  it("stops at the character limit", async () => {
    await exec("SET ROLE garrison_bot");
    for (let i = 0; i < CHARACTERS_PER_MEMBER; i++)
      expect((await addRosterCharacter(db, G, ROOK, fields(`Alt ${i}`))).ok).toBe(true);
    expect((await addRosterCharacter(db, G, ROOK, fields("One more"))).ok).toBe(false);
    await exec("RESET ROLE");
  });

  it("puts people on a team with a status and an officer's note, and counts who shows up", async () => {
    await exec("SET ROLE garrison_web");
    const [team] = await db.select().from(rosterTeams);
    if (!team) throw new Error("no team");
    expect(await addRosterMember(db, G, team.id, KEL)).toBe("added");
    expect(await addRosterMember(db, G, team.id, KEL)).toBe("already");
    expect(await addRosterMember(db, G, team.id, ROOK, "trial")).toBe("added");
    expect(
      await setRosterMember(db, G, team.id, ROOK.id, { status: "bench", note: "Late twice" }),
    ).toBe(true);
    expect(await listRosterMembers(db, G, [team.id])).toMatchObject([
      { userId: KEL.id, status: "core" },
      { userId: ROOK.id, status: "bench", note: "Late twice" },
    ]);
    expect(await listMemberTeams(db, G, ROOK.id)).toMatchObject([{ status: "bench" }]);
    expect((await rosterCandidates(db, G)).get(KEL.id)).toBe("kel2");
    await exec("RESET ROLE");

    await exec("SET ROLE garrison_bot");
    const raid = await createOpsEvent(db, {
      guildId: G,
      channelId: "980000000000000041",
      hostId: KEL.id,
      title: "Raid night",
      note: null,
      slots: [{ name: "DPS", count: 10 }],
      startsAt: new Date(Date.now() - 86_400_000),
      timezone: "UTC",
      repeatWeekly: false,
    });
    if (!raid) throw new Error("no raid");
    await db.insert(opsSignups).values([
      { eventId: raid.id, userId: KEL.id, role: "DPS", attended: true },
      { eventId: raid.id, userId: ROOK.id, role: "DPS", attended: false },
    ]);
    await exec("RESET ROLE");
    await exec("SET ROLE garrison_web");
    const seen = await rosterAttendance(
      db,
      G,
      [KEL.id, ROOK.id],
      new Date(Date.now() - 7 * 86_400_000),
    );
    expect(seen.get(KEL.id)).toEqual({ shown: 1, total: 1 });
    expect(seen.get(ROOK.id)).toEqual({ shown: 0, total: 1 });
    expect(await removeRosterMember(db, G, team.id, ROOK.id)).toBe(true);
    await exec("RESET ROLE");
  });

  it("lets the bot read teams but never change them", async () => {
    await exec("SET ROLE garrison_bot");
    expect((await listRosterMembers(db, G)).length).toBe(1);
    const denied = await Promise.resolve(
      db.insert(rosterTeams).values({ guildId: G, name: "Sneaky" }),
    ).then(
      () => null,
      (e: Error & { cause?: Error }) => `${e.message} ${e.cause?.message ?? ""}`,
    );
    expect(denied).toMatch(/permission denied/);
    await exec("RESET ROLE");
  });
});

describe("answering an organized raid", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
  });
  afterAll(async () => {
    await exec("RESET ROLE");
    await close();
  });

  const raid = (style: "simple" | "organized") =>
    createOpsEvent(db, {
      guildId: G,
      channelId: "980000000000000041",
      hostId: KEL.id,
      title: `${style} night`,
      note: null,
      slots: [
        { name: "Tank", count: 2 },
        { name: "Healer", count: 4 },
      ],
      startsAt: new Date(Date.now() + 86_400_000),
      timezone: "UTC",
      repeatWeekly: false,
      style,
    });

  it("matches the role to the raid's, keeps can't on the bench, and says when nothing changed", async () => {
    expect(slotFor([{ name: "Healer", count: 1 }], " healer ")).toBe("Healer");
    expect(slotFor([{ name: "Healer", count: 1 }], "DPS")).toBeNull();
    const event = await raid("organized");
    if (!event) throw new Error("no raid");
    const coming = await answerRaid(db, event.id, KEL.id, {
      availability: "coming",
      role: "tank",
      spec: "Thrall · Protection Warrior",
      characterId: null,
    });
    expect(coming).toMatchObject({
      ok: true,
      signups: [{ userId: KEL.id, role: "Tank", bench: false, availability: "coming" }],
    });
    expect(
      await answerRaid(db, event.id, KEL.id, {
        availability: "coming",
        role: "Tank",
        spec: "Thrall · Protection Warrior",
        characterId: null,
      }),
    ).toEqual({ ok: false, reason: "unchanged" });
    expect(
      await answerRaid(db, event.id, ROOK.id, {
        availability: "late",
        role: "DPS",
        spec: null,
        characterId: null,
      }),
    ).toEqual({ ok: false, reason: "no_such_role" });
    const cant = await answerRaid(db, event.id, KEL.id, {
      availability: "cant",
      role: "Tank",
      spec: "x",
      characterId: null,
    });
    expect(cant).toMatchObject({
      ok: true,
      signups: [{ userId: KEL.id, role: "", bench: true, availability: "cant", spec: null }],
    });
    const simple = await raid("simple");
    if (!simple) throw new Error("no raid");
    expect(
      await answerRaid(db, simple.id, KEL.id, {
        availability: "coming",
        role: "Tank",
        spec: null,
        characterId: null,
      }),
    ).toEqual({ ok: false, reason: "not_organized" });
  });
});

describe("an organized raid's lineup", () => {
  let db: Db;
  let exec: (sql: string) => Promise<unknown>;
  let close: () => Promise<void>;
  const P = (n: number) => `98000000000000010${n}`;

  beforeAll(async () => {
    ({ db, exec, close } = await createTestDb());
    await exec("SET ROLE garrison_bot");
    await upsertGuild(db, { id: G, name: "Iron Vanguard" });
    await exec("RESET ROLE");
  });
  afterAll(() => close());

  it("fills by role, Coming first, spreading the first role across groups", () => {
    const placed = fillByRole(
      [
        { userId: "t1", role: "Tank", availability: "coming" },
        { userId: "h1", role: "Healer", availability: "tentative" },
        { userId: "t2", role: "Tank", availability: "coming" },
        { userId: "t3", role: "Tank", availability: "late" },
        { userId: "h2", role: "Healer", availability: "coming" },
        { userId: "d1", role: "DPS", availability: "coming" },
        { userId: "x", role: "", availability: "cant" },
      ],
      [
        { name: "Tank", count: 2 },
        { name: "Healer", count: 2 },
        { name: "DPS", count: 4 },
      ],
      { count: 2, size: 2 },
    );
    expect(Object.fromEntries(placed)).toEqual({
      t1: 1,
      t2: 2,
      h2: 1,
      h1: 2,
      d1: "bench",
      t3: "bench",
    });
    expect(defaultGroups([{ count: 20 }], "wow")).toEqual({ count: 4, size: 5 });
    expect(defaultGroups([{ count: 60 }], "wow")).toEqual({ count: 8, size: 5 });
    expect(checkGroups({ count: "11", size: "5" })).toBeNull();
  });

  it("saves places on the dashboard, keeps them when people answer again, and posts", async () => {
    await exec("SET ROLE garrison_bot");
    const event = await createOpsEvent(db, {
      guildId: G,
      channelId: "980000000000000041",
      hostId: KEL.id,
      title: "Lineup night",
      note: null,
      slots: [
        { name: "Tank", count: 1 },
        { name: "DPS", count: 3 },
      ],
      startsAt: new Date(Date.now() + 86_400_000),
      timezone: "UTC",
      repeatWeekly: false,
      style: "organized",
    });
    if (!event) throw new Error("no raid");
    const say = (n: number, availability: "coming" | "late" | "cant", role: string) =>
      answerRaid(db, event.id, P(n), { availability, role, spec: null, characterId: null });
    await say(1, "coming", "Tank");
    await say(2, "coming", "DPS");
    await say(3, "late", "DPS");
    await say(4, "cant", "DPS");
    await exec("RESET ROLE");

    await exec("SET ROLE garrison_web");
    const groups = { count: 2, size: 2 };
    expect(
      await saveLineup(db, G, event.id, groups, new Map([[P(4), 1 as Placement]])),
    ).toMatchObject({ ok: false, error: "Someone who can't come is in the lineup." });
    expect(
      await saveLineup(
        db,
        G,
        event.id,
        groups,
        new Map<string, Placement>([
          [P(1), 1],
          [P(2), 1],
          [P(3), 1],
        ]),
      ),
    ).toMatchObject({ ok: false, error: "Group 1 has more than 2 players." });
    expect(
      await saveLineup(
        db,
        G,
        event.id,
        groups,
        new Map<string, Placement>([
          [P(1), 1],
          [P(2), 2],
          [P(3), "bench"],
        ]),
      ),
    ).toEqual({ ok: true, value: null });
    expect(await saveLineupLayout(db, G, event.id, "Farm night")).toEqual({
      ok: true,
      value: "Farm night",
    });
    const [layout] = await listLineupLayouts(db, G);
    expect(layout?.places).toEqual([
      { userId: P(1), group: 1 },
      { userId: P(2), group: 2 },
      { userId: P(3), group: 0 },
    ]);
    await exec("RESET ROLE");

    await exec("SET ROLE garrison_bot");
    // Answering again keeps the officers' call; Can't leaves the group.
    await say(3, "coming", "DPS");
    await say(2, "cant", "DPS");
    const posted = await postLineup(db, G, event.id);
    const by = new Map(posted?.signups.map((s) => [s.userId, s]));
    expect(posted?.event.lineupPostedAt).toBeInstanceOf(Date);
    expect(by.get(P(1))).toMatchObject({ groupNo: 1, bench: false });
    expect(by.get(P(2))).toMatchObject({ groupNo: null, bench: true, availability: "cant" });
    expect(by.get(P(3))).toMatchObject({ groupNo: null, bench: true });
    await exec("RESET ROLE");
  });
});
