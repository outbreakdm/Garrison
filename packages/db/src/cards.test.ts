import { describe, expect, it } from "vitest";
import {
  blankCard,
  type CustomCard,
  cardForPlan,
  lockedCardFields,
  parseCard,
  previewableImage,
} from "./cards";
import { entitlements } from "./plans";

const free = entitlements("free");
const pro = entitlements("pro");

describe("cards", () => {
  it("tidies text and drops empty parts and stray dividers", () => {
    const r = parseCard({
      title: "  Hello   there ",
      blocks: [
        { kind: "divider" },
        { kind: "text", text: "a  \r\n\r\n\r\n\r\nb" },
        { kind: "divider" },
        { kind: "divider" },
        { kind: "text", text: "   " },
        { kind: "divider" },
      ],
      accent: "#D4FF3A",
      footer: null,
    });
    expect(r.ok && r.value).toEqual({
      ...blankCard("Hello there"),
      blocks: [{ kind: "text", text: "a\n\nb" }],
    });
  });

  it("refuses bad colours, links and sizes with a plain reason", () => {
    const base = blankCard("Hi");
    expect(parseCard({ ...base, accent: "red" })).toMatchObject({ ok: false });
    expect(parseCard({ ...base, image: "http://example.com/a.png" })).toMatchObject({
      ok: false,
      error: "The banner image needs a link starting with https://.",
    });
    expect(parseCard({ ...base, title: "" })).toMatchObject({ ok: false });
    expect(
      parseCard({
        ...base,
        blocks: Array.from({ length: 7 }, () => ({ kind: "text", text: "x" })),
      }),
    ).toMatchObject({ ok: false });
  });

  it("keeps Pro looks stored but draws the standard look on Free", () => {
    const card: CustomCard = {
      ...blankCard("Hi"),
      accent: "#ff0000",
      image: "https://cdn.discordapp.com/a.png",
      footer: "",
    };
    expect(lockedCardFields(card, free).map((f) => f.key)).toEqual(["accent", "image", "footer"]);
    expect(lockedCardFields(card, pro)).toEqual([]);
    // Already saved values are let through, so a downgraded server can still edit.
    expect(lockedCardFields(card, free, card)).toEqual([]);
    expect(cardForPlan(card, free)).toEqual(blankCard("Hi"));
    expect(cardForPlan(card, pro)).toEqual(card);
  });

  it("previews images only from Discord's CDN", () => {
    expect(previewableImage("https://cdn.discordapp.com/attachments/1/2/a.png")).toBe(true);
    expect(previewableImage("https://i.imgur.com/a.png")).toBe(false);
    expect(previewableImage(null)).toBe(false);
  });
});
