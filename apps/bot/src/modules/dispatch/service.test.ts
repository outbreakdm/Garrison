import { blankCard, entitlements, type SavedMessage } from "@garrison/db";
import { describe, expect, it } from "vitest";
import { cardTexts } from "../../lib/card.js";
import { dispatchMessage } from "./service.js";

const m: SavedMessage = {
  id: "msg0000001",
  name: "Raid night",
  card: blankCard("Raid night tonight"),
  buttons: [{ label: "Sign up", url: "https://example.com/raid" }],
  channelId: "300000000000000001",
  schedule: null,
};

describe("dispatch messages", () => {
  it("adds link buttons on Pro and pauses them on Free", () => {
    expect(cardTexts(dispatchMessage(m, entitlements("pro")))).toContain("[Sign up]");
    expect(cardTexts(dispatchMessage(m, entitlements("free")))).not.toContain("[Sign up]");
  });
});
