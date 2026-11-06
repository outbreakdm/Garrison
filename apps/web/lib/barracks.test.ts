import { describe, expect, it } from "vitest";
import { isWowRegion, linksFromConnections, linksFromWowProfile } from "./barracks";

describe("linksFromConnections", () => {
  it("keeps verified game accounts only", () => {
    const links = linksFromConnections([
      { id: "765", name: "taner", type: "steam", verified: true },
      { id: "x", name: "taner#1234", type: "battlenet", verified: true },
      { id: "s", name: "taner", type: "spotify", verified: true },
      { id: "u", name: "fake", type: "xbox", verified: false },
      { id: "r", name: "gone", type: "playstation", verified: true, revoked: true },
      { nonsense: true },
    ]);
    expect(links.map((l) => `${l.provider}:${l.accountId}`)).toEqual(["steam:765", "battlenet:x"]);
  });
  it("tolerates a non-array response", () => {
    expect(linksFromConnections({ message: "401: Unauthorized" })).toEqual([]);
  });
});

describe("linksFromWowProfile", () => {
  const profile = {
    wow_accounts: [
      {
        characters: [
          {
            name: "Brannoc",
            level: 70,
            realm: { name: "Stormrage", slug: "stormrage" },
            playable_class: { name: "Warrior" },
            faction: { name: "Alliance" },
          },
          {
            name: "Alty",
            level: 12,
            realm: { name: "Area 52", slug: "area-52" },
            playable_class: { name: "Mage" },
          },
          { name: "Broken" },
        ],
      },
    ],
  };
  it("maps characters, highest level first, keyed by region and realm", () => {
    const links = linksFromWowProfile(profile, "us");
    expect(links.map((l) => l.accountId)).toEqual(["us:stormrage:brannoc", "us:area-52:alty"]);
    expect(links[0]?.details).toMatchObject({
      level: 70,
      className: "Warrior",
      realm: "Stormrage",
    });
  });
  it("yields nothing for unexpected shapes, and validates regions", () => {
    expect(linksFromWowProfile({ code: 403 }, "eu")).toEqual([]);
    expect(isWowRegion("eu")).toBe(true);
    expect(isWowRegion("cn")).toBe(false);
  });
});
