import { describe, expect, it } from "vitest";
import { entitlements } from "./plans";
import {
  activeResponders,
  checkResponders,
  findTag,
  matchResponder,
  type Responder,
  readResponders,
} from "./responders";

const free = entitlements("free");
const pro = entitlements("pro");
const r = (over: Partial<Responder> = {}): Responder => ({
  id: `resp${Math.random().toString(36).slice(2, 8)}`,
  name: "Rules",
  trigger: "word",
  text: "rules",
  reply: "Read #rules first.",
  channelIds: [],
  cooldownSeconds: 30,
  enabled: true,
  ...over,
});

describe("auto-responders and tags", () => {
  it("answers a whole word, without case or punctuation getting in the way", () => {
    const list = [r()];
    expect(matchResponder(list, { text: "where are the RULES?", channelId: "1" })?.name).toBe(
      "Rules",
    );
    expect(matchResponder(list, { text: "unruleset", channelId: "1" })).toBeNull();
  });

  it("answers a phrase only with its words in order", () => {
    const list = [r({ name: "IP", trigger: "phrase", text: "server ip" })];
    expect(matchResponder(list, { text: "what's the Server IP again", channelId: "1" })?.name).toBe(
      "IP",
    );
    expect(matchResponder(list, { text: "ip of the server", channelId: "1" })).toBeNull();
  });

  it("keeps to its channels, a thread counting as its parent, and leaves tags to /tag", () => {
    const list = [
      r({ channelIds: ["100000000000000001"] }),
      r({ trigger: "command", text: "rules" }),
    ];
    expect(matchResponder(list, { text: "rules", channelId: "200000000000000002" })).toBeNull();
    expect(
      matchResponder(list, {
        text: "rules",
        channelId: "300000000000000003",
        parentId: "100000000000000001",
      }),
    ).not.toBeNull();
    expect(findTag(list, "RULES")?.trigger).toBe("command");
  });

  it("checks a list like the page saves it", () => {
    expect(checkResponders([r()], free).ok).toBe(true);
    expect(checkResponders([r({ text: "two words" })], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/one word/),
    });
    expect(checkResponders([r({ trigger: "command", text: "bad name!" })], free).ok).toBe(false);
    expect(checkResponders([r({ reply: "hey @everyone" })], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/@everyone/),
    });
    expect(checkResponders([r({ name: "A" }), r({ name: "B" })], free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/both answer/),
    });
    // A word and a tag may share text: one answers chat, the other /tag.
    expect(checkResponders([r(), r({ trigger: "command" })], free).ok).toBe(true);
  });

  it("keeps Free to 10 and Pro to 100, and a server back on Free keeps its list", () => {
    const many = Array.from({ length: 11 }, (_, i) => r({ name: `R${i}`, text: `word${i}` }));
    expect(checkResponders(many, free)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Free servers can have 10/),
    });
    expect(checkResponders(many, pro).ok).toBe(true);
    expect(checkResponders(many, free, many).ok).toBe(true);
    // On Free only the first 10 work; the rest pause.
    expect(activeResponders(many, free)).toHaveLength(10);
    expect(activeResponders([r({ enabled: false })], pro)).toEqual([]);
  });

  it("reads a stored list leniently", () => {
    expect(readResponders([r(), { id: "x" }, "nope"])).toHaveLength(1);
    expect(readResponders(null)).toEqual([]);
  });
});
