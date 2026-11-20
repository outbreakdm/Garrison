/**
 * Applications and recruitment forms (best bot item 4): a panel with an Apply button opens
 * Discord's form of questions; the answers go to the staff channel as a card with Accept and
 * Decline, and accepting gives the form's roles. Staff decide from the card or the dashboard,
 * and only one decision lands. Questions follow the verification questions' rules (Discord's
 * form holds five parts, an intro counting as one). Pure and shared.
 *
 * Free: one form. Pro: 10. A server back on Free keeps its forms; past the limit they pause.
 */

import type { Entitlements } from "./plans";
import type { Parsed } from "./rally";
import { checkVerifyQuestions, type VerifyQuestion } from "./verify-questions";

export interface ApplicationForm {
  /** Stable across edits; the Apply button and every application name it. */
  id: string;
  /** What the dashboard calls it: "Raid team", "Staff". */
  name: string;
  /** The panel's title and text, as members see them before applying. */
  title: string;
  body: string | null;
  /** Shown at the top of Discord's form, in Markdown. */
  intro: string | null;
  questions: VerifyQuestion[];
  /** Where the answers go for staff. */
  reviewChannelId: string;
  /** Given when an application is accepted. Never one with moderation powers. */
  acceptRoleIds: string[];
  /** The panel's button. */
  buttonLabel: string;
}

export const APPLICATION_LIMITS = {
  forms: 10,
  name: 40,
  title: 100,
  body: 1000,
  roles: 5,
  button: 30,
} as const;

/** How long applications are kept before they're deleted. */
export const APPLICATIONS_DAYS = 90;

const ID = /^[a-z0-9]{6,16}$/;
const SNOWFLAKE = /^\d{17,20}$/;

export const formLimit = (ent: Entitlements) => ent["applications.forms"];

/** One form, checked. Roles and the channel belonging to the server are checked by the caller. */
export function parseApplicationForm(raw: unknown, i = 0): Parsed<ApplicationForm> {
  if (!raw || typeof raw !== "object") return { ok: false, error: `Form ${i + 1} isn't valid.` };
  const f = raw as Record<string, unknown>;
  const name = typeof f.name === "string" ? f.name.trim() : "";
  const where = name || `Form ${i + 1}`;
  if (typeof f.id !== "string" || !ID.test(f.id))
    return { ok: false, error: `${where} has no valid ID. Refresh and try again.` };
  if (!name) return { ok: false, error: `Form ${i + 1} needs a name.` };
  if (name.length > APPLICATION_LIMITS.name)
    return { ok: false, error: `Names hold ${APPLICATION_LIMITS.name} characters.` };
  const title = typeof f.title === "string" ? f.title.trim() : "";
  if (!title) return { ok: false, error: `${where}: give the panel a title.` };
  if (title.length > APPLICATION_LIMITS.title)
    return { ok: false, error: `${where}: titles hold ${APPLICATION_LIMITS.title} characters.` };
  const body = typeof f.body === "string" ? f.body.trim().replace(/\r\n/g, "\n") : "";
  if (body.length > APPLICATION_LIMITS.body)
    return { ok: false, error: `${where}: the text holds ${APPLICATION_LIMITS.body} characters.` };
  const asked = checkVerifyQuestions({
    verifyQuestions: f.questions,
    verifyIntro: f.intro,
    verifyAnswersChannelId: f.reviewChannelId,
  });
  if (!asked.ok) return { ok: false, error: `${where}: ${asked.error}` };
  if (!asked.value.verifyQuestions.length)
    return { ok: false, error: `${where}: add at least one question.` };
  const reviewChannelId = asked.value.verifyAnswersChannelId;
  if (!reviewChannelId)
    return { ok: false, error: `${where}: pick the staff channel applications go to.` };
  const acceptRoleIds = Array.isArray(f.acceptRoleIds)
    ? [...new Set(f.acceptRoleIds.map(String).filter(Boolean))]
    : [];
  if (!acceptRoleIds.every((r) => SNOWFLAKE.test(r)))
    return { ok: false, error: `${where}: pick roles from this server's list.` };
  if (acceptRoleIds.length > APPLICATION_LIMITS.roles)
    return { ok: false, error: `${where}: up to ${APPLICATION_LIMITS.roles} roles.` };
  const buttonLabel =
    typeof f.buttonLabel === "string" && f.buttonLabel.trim() ? f.buttonLabel.trim() : "Apply";
  if (buttonLabel.length > APPLICATION_LIMITS.button)
    return {
      ok: false,
      error: `${where}: the button holds ${APPLICATION_LIMITS.button} characters.`,
    };
  return {
    ok: true,
    value: {
      id: f.id,
      name,
      title,
      body: body || null,
      intro: asked.value.verifyIntro,
      questions: asked.value.verifyQuestions,
      reviewChannelId,
      acceptRoleIds,
      buttonLabel,
    },
  };
}

/** A server's whole list, as the dashboard saves it. `before`: what's saved now. */
export function checkApplicationForms(
  raw: unknown,
  ent: Entitlements,
  before: ApplicationForm[] = [],
): Parsed<ApplicationForm[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "Forms must be a list." };
  if (raw.length > APPLICATION_LIMITS.forms)
    return { ok: false, error: `A server can have ${APPLICATION_LIMITS.forms} forms.` };
  const limit = formLimit(ent);
  if (raw.length > limit && raw.length > before.length)
    return {
      ok: false,
      error: `Free servers can have ${limit} form. Garrison Pro allows ${APPLICATION_LIMITS.forms}.`,
    };
  const out: ApplicationForm[] = [];
  for (const [i, x] of raw.entries()) {
    const f = parseApplicationForm(x, i);
    if (!f.ok) return f;
    if (out.some((o) => o.id === f.value.id))
      return { ok: false, error: "Two forms share an ID. Refresh and try again." };
    if (out.some((o) => o.name.toLowerCase() === f.value.name.toLowerCase()))
      return { ok: false, error: `Two forms are called ${f.value.name}.` };
    out.push(f.value);
  }
  return { ok: true, value: out };
}

/** A stored list, read leniently: a form that doesn't make sense is left out. */
export function readApplicationForms(raw: unknown): ApplicationForm[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x, i) => {
    const f = parseApplicationForm(x, i);
    return f.ok ? [f.value] : [];
  });
}

/** Whether a form takes applications on this plan: the first ones in the list do. */
export const formOpen = (forms: ApplicationForm[], id: string, ent: Entitlements) => {
  const at = forms.findIndex((f) => f.id === id);
  return at >= 0 && at < formLimit(ent);
};
