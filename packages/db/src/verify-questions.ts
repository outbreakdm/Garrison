/**
 * Verification questions: what a new member answers before getting the verified role, in
 * Discord's form (the Verify button) or on the website. Answers go to a staff channel as a
 * card. Two ways to finish: answering is enough (the role is given at once), or staff
 * approve each member from that card or the dashboard. Pure and shared.
 *
 * A Discord form holds five parts: an intro (Markdown, shown at the top) and four
 * questions, or five questions with no intro.
 */

import type { Parsed } from "./rally";

export interface VerifyQuestion {
  /** Stable, so answers line up with their question after edits. */
  id: string;
  /** The question, as the form's label. */
  label: string;
  /** A line under the label: what a good answer looks like. */
  help: string | null;
  /** A paragraph box instead of one line. */
  long: boolean;
}

export interface VerifyAnswer {
  label: string;
  value: string;
}

export const VERIFY_LIMITS = {
  /** Discord's form: five parts, the intro counting as one. */
  parts: 5,
  label: 45,
  help: 100,
  intro: 600,
  short: 200,
  long: 1000,
} as const;

/** How long answers are kept before they're deleted. */
export const VERIFY_ANSWERS_DAYS = 30;

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;

export function newQuestionId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** A stored list, read leniently: a question without a label is left out. */
export function readVerifyQuestions(raw: unknown): VerifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: VerifyQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const label = text(q.label, VERIFY_LIMITS.label);
    if (!label || typeof q.id !== "string" || !ID.test(q.id) || seen.has(q.id)) continue;
    seen.add(q.id);
    out.push({ id: q.id, label, help: text(q.help, VERIFY_LIMITS.help), long: q.long === true });
  }
  return out.slice(0, VERIFY_LIMITS.parts);
}

/** How many questions fit beside the intro. */
export const questionRoom = (intro: string | null) =>
  intro?.trim() ? VERIFY_LIMITS.parts - 1 : VERIFY_LIMITS.parts;

export interface VerifyQuestionsConfig {
  verifyQuestions: VerifyQuestion[];
  verifyIntro: string | null;
  verifyReview: boolean;
  verifyAnswersChannelId: string | null;
}

/** Check a change from the dashboard. Channel ownership is checked by the caller. */
export function checkVerifyQuestions(raw: Record<string, unknown>): Parsed<VerifyQuestionsConfig> {
  const list = Array.isArray(raw.verifyQuestions) ? raw.verifyQuestions : [];
  const intro = typeof raw.verifyIntro === "string" ? raw.verifyIntro.trim() : "";
  if (intro.length > VERIFY_LIMITS.intro)
    return { ok: false, error: `The intro holds ${VERIFY_LIMITS.intro} characters.` };
  const room = questionRoom(intro);
  if (list.length > room)
    return {
      ok: false,
      error: intro
        ? "Discord's form holds the intro and four questions."
        : "Discord's form holds five questions.",
    };
  const ids = new Set<string>();
  const questions: VerifyQuestion[] = [];
  for (const [i, item] of list.entries()) {
    const q = (item ?? {}) as Record<string, unknown>;
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (!label) return { ok: false, error: `Question ${i + 1} needs its question.` };
    if (label.length > VERIFY_LIMITS.label)
      return {
        ok: false,
        error: `Question ${i + 1}: Discord's form shows ${VERIFY_LIMITS.label} characters of a question.`,
      };
    const help = typeof q.help === "string" ? q.help.trim() : "";
    if (help.length > VERIFY_LIMITS.help)
      return {
        ok: false,
        error: `Question ${i + 1}: the line under it holds ${VERIFY_LIMITS.help} characters.`,
      };
    let id = typeof q.id === "string" && ID.test(q.id) ? q.id : newQuestionId();
    while (ids.has(id)) id = newQuestionId();
    ids.add(id);
    questions.push({ id, label, help: help || null, long: q.long === true });
  }
  const channel =
    typeof raw.verifyAnswersChannelId === "string" && raw.verifyAnswersChannelId
      ? raw.verifyAnswersChannelId
      : null;
  if (channel && !SNOWFLAKE.test(channel))
    return { ok: false, error: "Pick the answers channel from this server's list." };
  if (questions.length && !channel)
    return { ok: false, error: "Pick the staff channel the answers go to." };
  const review = raw.verifyReview === true;
  if (review && !questions.length)
    return { ok: false, error: "Add a question for staff to review answers." };
  return {
    ok: true,
    value: {
      verifyQuestions: questions,
      verifyIntro: intro || null,
      verifyReview: review,
      verifyAnswersChannelId: channel,
    },
  };
}

/**
 * A member's answers, checked against the questions: every question answered, within the
 * box's length. Returns them in the questions' order, labelled, for the staff card.
 */
export function checkVerifyAnswers(
  questions: VerifyQuestion[],
  given: Record<string, string>,
): Parsed<VerifyAnswer[]> {
  const out: VerifyAnswer[] = [];
  for (const q of questions) {
    const value = (given[q.id] ?? "").trim();
    if (!value) return { ok: false, error: `Answer “${q.label}”.` };
    const max = q.long ? VERIFY_LIMITS.long : VERIFY_LIMITS.short;
    if (value.length > max)
      return { ok: false, error: `“${q.label}” takes up to ${max} characters.` };
    out.push({ label: q.label, value });
  }
  return { ok: true, value: out };
}
