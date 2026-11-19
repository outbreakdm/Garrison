import { describe, expect, it } from "vitest";
import type { ChatResult, Planner } from "../modules/quartermaster/planner.js";
import { type Answer, CASES } from "./cases.js";
import { CHANNELS, ID } from "./fixture.js";
import { grade } from "./grade.js";
import { runEval, summarize } from "./harness.js";

/**
 * The eval's own checks, with no model: every reference answer passes (the cases and graders
 * agree), answers that do nothing or do harm fail, and the harness carries an answer from the
 * planner to a graded row.
 */

const answer = (reply: string, plan: Answer["plan"] = null): Answer => ({ reply, plan });

describe("the AI assistant eval", () => {
  it("has 40 or more cases with unique ids, across every category", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(new Set(CASES.map((c) => c.category)).size).toBe(10);
    // Both directions: cases that must draft and cases that must not.
    expect(CASES.filter((c) => c.draft === "yes").length).toBeGreaterThan(10);
    expect(CASES.filter((c) => c.draft === "no").length).toBeGreaterThan(10);
  });

  it("passes every case's reference answer (oracle)", () => {
    const failing = CASES.map((c) => ({ id: c.id, g: grade(c, c.reference) })).filter(
      (x) => !x.g.pass,
    );
    expect(failing.map((x) => `${x.id}: ${x.g.reasons.join("; ")}`)).toEqual([]);
  });

  it("fails most cases with an empty answer (null baseline)", () => {
    const passed = CASES.filter((c) => grade(c, answer("")).pass).length;
    expect(passed).toBe(0);
    const shrug = CASES.filter((c) => grade(c, answer("Sure.")).pass).length;
    expect(shrug / CASES.length).toBeLessThan(0.25);
  });

  it("fails every case when the plan deletes the server", () => {
    const wipe: Answer["plan"] = {
      summary: "x",
      notes: "",
      operations: [],
      order: [],
      settings: [],
      posts: [],
      edits: CHANNELS.filter((c) => c.id !== ID.rules && c.id !== ID.general).map((c) => ({
        kind: "delete_channel" as const,
        id: c.id as string,
        name: null,
        topic: null,
        slowmode_seconds: null,
        user_limit: null,
        nsfw: null,
        parent: null,
        access: null,
        sync_with_category: null,
        color_hex: null,
        hoist: null,
        mentionable: null,
        permissions: null,
      })),
    };
    const passed = CASES.filter((c) => grade(c, answer("Done.", wipe)).pass).map((c) => c.id);
    expect(passed).toEqual([]);
  });

  it("runs cases through a planner into graded rows, and keeps errors apart", async () => {
    const byAsk = new Map(CASES.map((c) => [c.ask, c]));
    const planner: Planner = {
      model: "claude-haiku-5-5",
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async (input): Promise<ChatResult> => {
        const c = byAsk.get(input.history.at(-1)?.text ?? "");
        if (c?.id === "refusal-ban") return { ok: false, error: "Claude had a problem with that." };
        return {
          ok: true,
          reply: c?.reference.reply ?? "",
          choices: [],
          plan: c?.reference.plan ?? null,
          model: "claude-haiku-5-5",
          usage: { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 100 },
        };
      },
    };
    const { rows, errors } = await runEval({ fast: planner }, CASES, 1);
    expect(rows).toHaveLength(CASES.length - 1);
    expect(rows.every((r) => r.grade.pass)).toBe(true);
    expect(errors).toEqual([expect.objectContaining({ case: "refusal-ban", kind: "api" })]);
    expect(summarize(rows, errors, CASES)).toContain("| Fast | 100% ±0");
  });

  it("counts an answer from the wrong model as an error, not a score", async () => {
    const planner: Planner = {
      plan: async () => ({ ok: false, error: "not used" }),
      chat: async () => ({
        ok: true,
        reply: "Hi",
        choices: [],
        plan: null,
        model: "claude-opus-5-5",
      }),
    };
    const { rows, errors } = await runEval({ fast: planner }, CASES.slice(0, 1), 1);
    expect(rows).toEqual([]);
    expect(errors[0]?.kind).toBe("wrong-model");
  });
});
