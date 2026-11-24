/**
 * Suggestions: members post ideas from the suggestions panel (its button opens Discord's form)
 * or with /suggest; each becomes a card in the server's suggestions channel with For and
 * Against buttons; staff mark it Planned, Done or Declined from the dashboard, with a short
 * note the card shows. Pure and shared.
 *
 * Free: the whole board, the panel and its form. Pro: anonymous mode (the card hides who
 * posted; staff still see it on the dashboard).
 */

import { PANEL_LIMITS, panelText, readPanelText } from "./panels";
import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";
import {
  readVerifyQuestions,
  VERIFY_LIMITS,
  type VerifyAnswer,
  type VerifyQuestion,
} from "./verify-questions";

export const SUGGESTION_STATUSES = ["open", "planned", "done", "declined"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  open: "Open",
  planned: "Planned",
  done: "Done",
  declined: "Declined",
};

export interface SuggestionsConfig {
  enabled: boolean;
  channelId: string | null;
  /** Pro: cards don't say who posted. */
  anonymous: boolean;
  /** The panel members press to suggest: its card and button. Null is the standard text. */
  panelTitle: string | null;
  panelBody: string | null;
  buttonLabel: string | null;
  /**
   * The form the panel's button opens. The first question is the idea itself and must be
   * answered; the others are optional. Empty means the standard two.
   */
  questions: VerifyQuestion[];
  /** Post the panel again under each new suggestion in its channel, so it stays at the bottom. */
  panelSticky: boolean;
  /** Where the panel is, once Garrison has posted it. */
  panelChannelId: string | null;
  panelMessageId: string | null;
}

/** The panel's words until a server writes its own. */
export const SUGGESTION_PANEL = {
  title: "Got an idea?",
  body: "Press the button and tell us. Everyone votes For or Against, and staff mark what's planned.",
  button: "Suggest an idea",
} as const;

/** The form until a server writes its own: the idea, then why it would help (optional). */
export const DEFAULT_SUGGESTION_QUESTIONS: VerifyQuestion[] = [
  { id: "theidea", label: "Your idea", help: "What you'd like to see, in a line.", long: false },
  {
    id: "whyhelp",
    label: "Why it would help",
    help: "Optional: who it's for and what it changes.",
    long: true,
  },
];

export const DEFAULT_SUGGESTIONS: SuggestionsConfig = {
  enabled: false,
  channelId: null,
  anonymous: false,
  panelTitle: null,
  panelBody: null,
  buttonLabel: null,
  questions: [],
  panelSticky: true,
  panelChannelId: null,
  panelMessageId: null,
};

export const SUGGESTION_LIMITS = {
  text: 1000,
  note: 300,
  panelTitle: PANEL_LIMITS.title,
  panelBody: PANEL_LIMITS.body,
  button: PANEL_LIMITS.button,
} as const;
const SNOWFLAKE = /^\d{17,20}$/;

/** The form members fill in: the server's questions, or the standard two. */
export const suggestionQuestions = (c: Pick<SuggestionsConfig, "questions">) =>
  c.questions.length ? c.questions : DEFAULT_SUGGESTION_QUESTIONS;

/** The panel as members see it, with the standard words where the server wrote none. */
export const suggestionPanel = (
  c: Pick<SuggestionsConfig, "panelTitle" | "panelBody" | "buttonLabel">,
) => ({
  title: c.panelTitle ?? SUGGESTION_PANEL.title,
  body: c.panelBody ?? SUGGESTION_PANEL.body,
  button: c.buttonLabel ?? SUGGESTION_PANEL.button,
});

export function readSuggestions(
  raw: Partial<Record<keyof SuggestionsConfig, unknown>> | null,
): SuggestionsConfig {
  if (!raw) return { ...DEFAULT_SUGGESTIONS };
  const snowflake = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  return {
    enabled: raw.enabled === true,
    channelId: snowflake(raw.channelId),
    anonymous: raw.anonymous === true,
    panelTitle: readPanelText(raw.panelTitle, SUGGESTION_LIMITS.panelTitle),
    panelBody: readPanelText(raw.panelBody, SUGGESTION_LIMITS.panelBody),
    buttonLabel: readPanelText(raw.buttonLabel, SUGGESTION_LIMITS.button),
    questions: readVerifyQuestions(raw.questions),
    panelSticky: raw.panelSticky !== false,
    panelChannelId: snowflake(raw.panelChannelId),
    panelMessageId: snowflake(raw.panelMessageId),
  };
}

export type SuggestionBoard = Pick<SuggestionsConfig, "enabled" | "channelId" | "anonymous">;
export type SuggestionPanelConfig = Pick<
  SuggestionsConfig,
  "panelTitle" | "panelBody" | "buttonLabel" | "questions" | "panelSticky"
>;

/** Check a change from the dashboard. A saved anonymous mode stays on Free; turning it on doesn't. */
export function checkSuggestions(
  raw: Record<string, unknown>,
  ent: Entitlements,
  before: SuggestionBoard,
): Parsed<SuggestionBoard> {
  const channelId = typeof raw.channelId === "string" && raw.channelId ? raw.channelId : null;
  if (channelId && !SNOWFLAKE.test(channelId))
    return { ok: false, error: "Pick the suggestions channel from this server's list." };
  const enabled = raw.enabled === true;
  if (enabled && !channelId)
    return { ok: false, error: "Pick the channel suggestions are posted in." };
  const anonymous = raw.anonymous === true;
  if (anonymous && !ent["suggestions.anonymous"] && !before.anonymous)
    return { ok: false, error: "Anonymous suggestions are part of Garrison Pro." };
  return { ok: true, value: { enabled, channelId, anonymous } };
}

/**
 * Check the panel and its form. Text the same as the standard is stored as null, so it follows
 * the standard; the form is up to Discord's five questions, the first one being the idea.
 */
export function checkSuggestionPanel(raw: Record<string, unknown>): Parsed<SuggestionPanelConfig> {
  const L = SUGGESTION_LIMITS;
  const P = SUGGESTION_PANEL;
  const title = panelText(raw.panelTitle, L.panelTitle, "The panel's title", P.title);
  if (!title.ok) return title;
  const body = panelText(raw.panelBody, L.panelBody, "The panel's text", P.body);
  if (!body.ok) return body;
  const button = panelText(raw.buttonLabel, L.button, "The button", P.button);
  if (!button.ok) return button;
  if (button.value?.includes("\n")) return { ok: false, error: "The button's label is one line." };
  const list = Array.isArray(raw.questions) ? raw.questions : [];
  if (list.length > VERIFY_LIMITS.parts)
    return { ok: false, error: `Discord's form holds ${VERIFY_LIMITS.parts} questions.` };
  const questions: VerifyQuestion[] = [];
  const ids = new Set<string>();
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
    const id = typeof q.id === "string" && /^[a-z0-9]{6,16}$/.test(q.id) ? q.id : "";
    if (!id || ids.has(id)) return { ok: false, error: "Refresh the page and try again." };
    ids.add(id);
    questions.push({ id, label, help: help || null, long: q.long === true });
  }
  const standard =
    questions.length === DEFAULT_SUGGESTION_QUESTIONS.length &&
    questions.every(
      (q, i) => JSON.stringify(q) === JSON.stringify(DEFAULT_SUGGESTION_QUESTIONS[i]),
    );
  return {
    ok: true,
    value: {
      panelTitle: title.value,
      panelBody: body.value,
      buttonLabel: button.value,
      // The standard form is stored as none, so it follows the standard if it changes.
      questions: standard ? [] : questions,
      panelSticky: raw.panelSticky !== false,
    },
  };
}

/** The longest answer a question takes: a line, or a paragraph. */
export const answerMax = (q: Pick<VerifyQuestion, "long">) =>
  q.long ? SUGGESTION_LIMITS.text : VERIFY_LIMITS.short;

/**
 * A member's form, checked: the first answer (the idea) is required, the rest optional and
 * left out when empty. The idea becomes the suggestion's text; every answer is kept, labelled,
 * for the card.
 */
export function checkSuggestionAnswers(
  questions: VerifyQuestion[],
  given: Record<string, string>,
): Parsed<{ text: string; answers: VerifyAnswer[] }> {
  const answers: VerifyAnswer[] = [];
  for (const [i, q] of questions.entries()) {
    const value = (given[q.id] ?? "").trim();
    if (!value) {
      if (i === 0) return { ok: false, error: `Answer “${q.label}”.` };
      continue;
    }
    if (value.length > answerMax(q))
      return { ok: false, error: `“${q.label}” takes up to ${answerMax(q)} characters.` };
    answers.push({ label: q.label, value });
  }
  const text = answers[0]?.value;
  if (!text) return { ok: false, error: "Write what you'd like to suggest." };
  return { ok: true, value: { text, answers } };
}

/** A vote changes the counts: a second press of the same button takes the vote back. */
export function nextVote(current: -1 | 0 | 1, pressed: -1 | 1): -1 | 0 | 1 {
  return current === pressed ? 0 : pressed;
}
