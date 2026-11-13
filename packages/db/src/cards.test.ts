import { describe, expect, it } from "vitest";
import {
  blankCard,
  type CustomCard,
  cardForPlan,
  lockedCardFields,
  parseCard,
  previewableImage,
  restoreLockedCard,
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

  it("refuses bad colors, links and sizes with a plain reason", () => {
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

describe("embed extras (Pro)", () => {
  const free = entitlements("free");
  const pro = entitlements("pro");
  const withExtras = {
    ...blankCard("Support"),
    author: "Iron Vanguard support",
    url: "https://example.com/help",
    blocks: [
      { kind: "text" as const, text: "Pick a topic." },
      { kind: "divider" as const },
      { kind: "field" as const, name: "Hours", value: "6pm to midnight" },
    ],
  };

  it("parses an author line, a title link and fields, and refuses half a field", () => {
    const parsed = parseCard(withExtras);
    expect(parsed.ok && parsed.value).toMatchObject({
      author: "Iron Vanguard support",
      url: "https://example.com/help",
    });
    expect(parsed.ok && parsed.value.blocks.at(-1)).toEqual({
      kind: "field",
      name: "Hours",
      value: "6pm to midnight",
    });
    expect(
      parseCard({ ...withExtras, blocks: [{ kind: "field", name: "Hours", value: "" }] }),
    ).toMatchObject({ ok: false });
    expect(parseCard({ ...withExtras, url: "javascript:alert(1)" })).toMatchObject({ ok: false });
    // Cards saved before these existed still parse.
    const { author: _a, url: _u, ...old } = withExtras;
    expect(parseCard(old)).toMatchObject({ ok: true });
  });

  it("locks them on Free, lets saved ones through, and undoes only them", () => {
    const locks = lockedCardFields(withExtras, free, blankCard("Support"));
    expect(locks.map((l) => l.label)).toEqual(["Author line", "Title link", "Fields"]);
    expect(lockedCardFields(withExtras, pro, null)).toEqual([]);
    expect(lockedCardFields(withExtras, free, withExtras)).toEqual([]);
    const undone = restoreLockedCard(withExtras, blankCard("Support"), locks);
    expect(undone).toMatchObject({ author: null, url: null });
    expect(undone.blocks).toEqual([{ kind: "text", text: "Pick a topic." }, { kind: "divider" }]);
  });

  it("draws the standard card on Free, without fields or a dangling divider", () => {
    const drawn = cardForPlan(withExtras, free);
    expect(drawn).toMatchObject({ author: null, url: null });
    expect(drawn.blocks).toEqual([{ kind: "text", text: "Pick a topic." }]);
    expect(cardForPlan(withExtras, pro).blocks).toHaveLength(3);
  });
});
