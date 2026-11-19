import { blankCard, type QmWrite, withText } from "@garrison/db";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WritePreview } from "./WritePreview";

const names = {
  roles: new Map<string, string>(),
  channels: new Map([["200000000000000003", "roles"]]),
};

describe("what a draft writes", () => {
  it("shows each write in full, Discord's way, with what it replaces folded under it", () => {
    const writes: QmWrite[] = [
      {
        kind: "welcome",
        field: "joinCard",
        name: "The welcome card",
        card: withText(
          blankCard(),
          "Welcome!",
          "Hey {user}, pick roles in <#200000000000000003>.\n\n**Have fun.**",
        ),
        was: withText(blankCard(), "Hi", "Old text"),
      },
      {
        kind: "message",
        messageId: "abc123",
        isNew: true,
        name: "Rules",
        card: withText(blankCard(), "Rules", "Be kind."),
        was: null,
      },
    ];
    const html = renderToStaticMarkup(
      <WritePreview writes={writes} names={names} remove={() => null} />,
    );
    expect(html).toContain("The welcome card");
    expect(html).toContain("Welcome!");
    expect(html).toContain("#roles");
    expect(html).toContain("<strong>Have fun.</strong>");
    expect(html).toContain("What it says now");
    expect(html).toContain("Old text");
    expect(html).toContain("a new saved message");
  });
});
