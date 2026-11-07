import { describe, expect, it } from "vitest";
import { searchIndex } from "./search-index";

describe("searchIndex", () => {
  it("matches every word, in any field", () => {
    expect(searchIndex("retention").map((e) => e.title)).toEqual(["Keep events for"]);
    expect(searchIndex("ranks channel").map((e) => e.title)).toEqual(["Level-up messages"]);
    expect(searchIndex("LOCKDOWN").length).toBeGreaterThan(1);
  });
  it("finds nothing for blank or unknown queries", () => {
    expect(searchIndex("   ")).toEqual([]);
    expect(searchIndex("zzzz")).toEqual([]);
  });
});

import { plainMentions } from "../components/format";

describe("plainMentions", () => {
  it("names the kind of each mention", () => {
    expect(plainMentions("<@&5> and <#6> and <@!7> and <@8>")).toBe(
      "a role and a channel and a member and a member",
    );
  });
});
