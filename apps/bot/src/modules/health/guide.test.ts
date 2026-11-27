import { describe, expect, it } from "vitest";
import { cardMessage } from "../../lib/card.js";
import { helloCard } from "../../lib/hello.js";
import { isHello } from "./guide.js";

const message = (
  payload: { components: { toJSON(): unknown }[] },
  embeds: { title?: string }[] = [],
) => ({ components: payload.components, embeds }) as unknown as Parameters<typeof isHello>[0];

describe("/guide finds Garrison's welcome message", () => {
  it("knows the starting guide, and the shorter hello from before it", () => {
    expect(isHello(message(cardMessage(helloCard("1", "https://dash.example.com"))))).toBe(true);
    const before = cardMessage({
      title: "Thanks for adding Garrison",
      lead: "Moderation, safety…",
    });
    expect(isHello(message(before))).toBe(true);
  });

  it("knows an old embed hello, and leaves other cards alone", () => {
    expect(isHello(message({ components: [] }, [{ title: "Thanks for adding Garrison" }]))).toBe(
      true,
    );
    expect(isHello(message(cardMessage({ title: "Test Raid Night" })))).toBe(false);
  });
});
