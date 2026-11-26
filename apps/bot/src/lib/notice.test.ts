import { embedColors } from "@garrison/brand";
import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import { notice } from "./card.js";

const textOf = (n: ReturnType<typeof notice>) => {
  const json = n.components[0].toJSON() as { components: { content?: string }[] };
  return json.components.map((c) => c.content).join("\n");
};

describe("notice", () => {
  it("is a private, mention-safe V2 card in the tone's color", () => {
    const n = notice("That raid is gone.", "alert");
    expect(n.flags & MessageFlags.Ephemeral).toBeTruthy();
    expect(n.flags & MessageFlags.IsComponentsV2).toBeTruthy();
    expect(n.allowedMentions).toEqual({ parse: [] });
    expect((n.components[0].toJSON() as { accent_color?: number }).accent_color).toBe(
      embedColors.alert,
    );
  });

  it("bolds the lead sentence when more follows", () => {
    expect(textOf(notice("Saved. Raids use UTC unless you say otherwise.", "go"))).toBe(
      "**Saved.**\nRaids use UTC unless you say otherwise.",
    );
  });

  it("leaves one-sentence and marked-up text as written", () => {
    expect(textOf(notice("That raid is gone."))).toBe("That raid is gone.");
    expect(textOf(notice("<@1> isn't here. Try again."))).toBe("<@1> isn't here. Try again.");
  });
});
