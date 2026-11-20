import { describe, expect, it } from "vitest";
import { QUESTIONS, shuffled } from "./trivia.js";

describe("trivia", () => {
  it("has four different answers to every question, each fitting a button card", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(40);
    for (const q of QUESTIONS) {
      expect(new Set(q.a).size, q.q).toBe(4);
      expect(q.q.length).toBeLessThanOrEqual(200);
    }
  });

  it("shuffles the answers and remembers where the right one went", () => {
    const q = QUESTIONS[0];
    if (!q) throw new Error("no questions");
    for (const pick of [() => 0, (n: number) => n - 1]) {
      const { answers, right } = shuffled(q, pick);
      expect([...answers].sort()).toEqual([...q.a].sort());
      expect(answers[right]).toBe(q.a[0]);
    }
  });
});
