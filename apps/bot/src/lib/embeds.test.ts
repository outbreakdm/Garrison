import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { embedColors } from "@garrison/brand";
import { describe, expect, it } from "vitest";
import { brandEmbed, done, failed, info } from "./embeds.js";

const color = (payload: { embeds: { toJSON(): { color?: number } }[] }) =>
  payload.embeds[0]?.toJSON().color;

describe("the three kinds of embed", () => {
  it("has no colour unless it's a confirmation or a danger", () => {
    expect(brandEmbed({ title: "Roster" }).toJSON().color).toBeUndefined();
    expect(brandEmbed({ kind: "done", title: "Saved" }).toJSON().color).toBe(embedColors.done);
    expect(brandEmbed({ kind: "danger", title: "Undo v3?" }).toJSON().color).toBe(
      embedColors.danger,
    );
    expect(Object.keys(embedColors)).toEqual(["done", "danger"]);
  });

  it("gives one-line replies their kind, and clears any old text", () => {
    expect(color(info("No open groups."))).toBeUndefined();
    expect(color(done("Closed your group."))).toBe(0x2bd99f);
    expect(color(failed("That raid is gone."))).toBe(0xff5c5c);
    expect(failed("x").content).toBe("");
    expect(failed("That raid is gone.").embeds[0]?.toJSON()).toEqual({
      color: 0xff5c5c,
      description: "That raid is gone.",
    });
  });
});

/** Every source file of the bot, tests aside. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("every reply goes through the helper", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = sources(root).map((path) => ({
    path: path.slice(root.length),
    text: readFileSync(path, "utf8"),
  }));

  it("builds embeds and sets colours in one place only", () => {
    const offenders = files
      .filter((f) => f.path !== "lib/embeds.ts")
      .filter((f) => /new EmbedBuilder\(|\.setColor\(/.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("never sends words as plain text: only the mentions that have to ping", () => {
    // A mention inside an embed doesn't notify, so a ping keeps its mentions
    // (and nothing else) outside. Everything said is inside an embed.
    const MENTIONS_ONLY =
      /^(pings|`<@&\$\{role\.id\}>`|userIds\.map\(\(id\) => `<@\$\{id\}>`\)\.join\(" "\)|"")$/;
    const offenders = files
      .filter((f) => f.path !== "lib/embeds.ts")
      .filter((f) => !f.path.startsWith("modules/quartermaster/planner"))
      .flatMap((f) =>
        [...f.text.matchAll(/\bcontent:\s*([^\n]*?),?\n/g)]
          .filter((m) => !MENTIONS_ONLY.test((m[1] ?? "").trim()))
          .map((m) => `${f.path}: ${m[1]}`),
      );
    expect(offenders).toEqual([]);
  });
});
